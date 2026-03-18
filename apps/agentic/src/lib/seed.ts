/**
 * Seed script — Load task templates and course structure into the database.
 *
 * Reads template JSON files from content/templates/ and creates:
 * - Course
 * - Capabilities (with prerequisite relationships)
 * - Modules (one per capability level)
 * - TaskTemplates
 * - Initial static tasks (generated from templates for bootstrapping)
 *
 * Usage: pnpm seed
 */

import { PrismaClient } from "../generated/prisma/index.js";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTask, type TaskTemplateInput } from "./task-generator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "../../content/templates");

const db = new PrismaClient();

interface TemplateFile {
  capability: {
    slug: string;
    name: string;
    description: string;
    level: number;
    prerequisites?: string[];
    branch?: string; // null/undefined = foundation; "research", "webdev", etc.
  };
  templates: Array<{
    slug: string;
    promptTemplate: string;
    parameterSchema: any;
    difficultyRange: any;
    rubricTemplate: any;
    goldSolution?: string;
  }>;
}

async function seed() {
  console.log("🌱 Seeding The Agentic Primer...\n");

  // Read all template files
  const templateFiles: TemplateFile[] = [];
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const content = readFileSync(join(TEMPLATES_DIR, file), "utf-8");
    templateFiles.push(JSON.parse(content));
    console.log(`  📄 Loaded ${file}`);
  }

  // Create course
  const course = await db.course.upsert({
    where: { slug: "foundation" },
    update: {
      title: "Agent Foundation",
      description: "Core capabilities every agent needs: tool discovery, selection, composition, planning, and meta-skills.",
      version: 2,
      published: true,
    },
    create: {
      slug: "foundation",
      title: "Agent Foundation",
      description: "Core capabilities every agent needs: tool discovery, selection, composition, planning, and meta-skills.",
      version: 2,
      published: true,
    },
  });
  console.log(`\n  📚 Course: ${course.title} (${course.slug})`);

  // Create capabilities (first pass — without prerequisites)
  const capabilityMap = new Map<string, string>(); // slug → id

  for (const tf of templateFiles) {
    const cap = await db.capability.upsert({
      where: {
        courseId_slug: {
          courseId: course.id,
          slug: tf.capability.slug,
        },
      },
      update: {
        name: tf.capability.name,
        description: tf.capability.description,
        level: tf.capability.level,
        branch: tf.capability.branch || null,
      },
      create: {
        slug: tf.capability.slug,
        name: tf.capability.name,
        description: tf.capability.description,
        level: tf.capability.level,
        branch: tf.capability.branch || null,
        courseId: course.id,
      },
    });
    capabilityMap.set(tf.capability.slug, cap.id);
    console.log(`  🎯 Capability: ${cap.name} (L${cap.level})`);
  }

  // Create prerequisite relationships (second pass)
  for (const tf of templateFiles) {
    if (tf.capability.prerequisites?.length) {
      const dependentId = capabilityMap.get(tf.capability.slug);
      if (!dependentId) continue;

      for (const prereqSlug of tf.capability.prerequisites) {
        const prerequisiteId = capabilityMap.get(prereqSlug);
        if (!prerequisiteId) {
          console.warn(`  ⚠️  Prerequisite '${prereqSlug}' not found for '${tf.capability.slug}'`);
          continue;
        }

        await db.capabilityPrereq.upsert({
          where: {
            prerequisiteId_dependentId: {
              prerequisiteId,
              dependentId,
            },
          },
          update: {},
          create: { prerequisiteId, dependentId },
        });
        console.log(`  🔗 ${prereqSlug} → ${tf.capability.slug}`);
      }
    }
  }

  // Create modules (one per level for foundation, one per branch+level for specializations)
  // Key: "foundation:L0", "research:L10", "webdev:L10", etc.
  const moduleKeys = new Set<string>();
  for (const tf of templateFiles) {
    const branch = tf.capability.branch || "foundation";
    moduleKeys.add(`${branch}:${tf.capability.level}`);
  }
  const moduleMap = new Map<string, string>(); // "branch:level" → moduleId

  let moduleOrder = 0;
  for (const key of [...moduleKeys].sort((a, b) => {
    const [aBranch, aLevel] = a.split(":");
    const [bBranch, bLevel] = b.split(":");
    // Foundation first, then branches alphabetically, then by level
    if (aBranch === "foundation" && bBranch !== "foundation") return -1;
    if (bBranch === "foundation" && aBranch !== "foundation") return 1;
    if (aBranch !== bBranch) return aBranch.localeCompare(bBranch);
    return Number(aLevel) - Number(bLevel);
  })) {
    const [branch, levelStr] = key.split(":");
    const level = Number(levelStr);

    const levelName =
      branch === "foundation" ? (
        level === 0 ? "Orientation" :
        level === 1 ? "Single Tool Mastery" :
        level === 2 ? "Composition" :
        level === 3 ? "Planning" :
        level === 4 ? "Human Collaboration" :
        level === 5 ? "Meta-Skills" :
        `Foundation Level ${level}`
      ) :
      `Specialization: ${branch} (L${level})`;

    const moduleId = branch === "foundation" ? `module-l${level}` : `module-${branch}-l${level}`;

    const mod = await db.module.upsert({
      where: { id: moduleId },
      update: { title: levelName, orderIndex: moduleOrder },
      create: {
        id: moduleId,
        title: levelName,
        orderIndex: moduleOrder,
        courseId: course.id,
      },
    });
    moduleMap.set(key, mod.id);
    moduleOrder++;
    console.log(`  📦 Module: ${mod.title}`);
  }

  // Create task templates and generate initial static tasks
  let templateCount = 0;
  let taskCount = 0;

  for (const tf of templateFiles) {
    const capabilityId = capabilityMap.get(tf.capability.slug);
    if (!capabilityId) continue;

    for (const tmpl of tf.templates) {
      const template = await db.taskTemplate.upsert({
        where: { slug: tmpl.slug },
        update: {
          capabilityId,
          promptTemplate: tmpl.promptTemplate,
          parameterSchema: tmpl.parameterSchema,
          difficultyRange: tmpl.difficultyRange,
          rubricTemplate: tmpl.rubricTemplate,
          goldSolution: tmpl.goldSolution || null,
        },
        create: {
          slug: tmpl.slug,
          capabilityId,
          promptTemplate: tmpl.promptTemplate,
          parameterSchema: tmpl.parameterSchema,
          difficultyRange: tmpl.difficultyRange,
          rubricTemplate: tmpl.rubricTemplate,
          goldSolution: tmpl.goldSolution || null,
        },
      });
      templateCount++;

      // Generate 3 initial static tasks per template at different difficulties
      const diffMin = tmpl.difficultyRange.min ?? 1;
      const diffMax = tmpl.difficultyRange.max ?? 3;
      const branch = tf.capability.branch || "foundation";
      const moduleId = moduleMap.get(`${branch}:${tf.capability.level}`);

      for (let d = diffMin; d <= Math.min(diffMax, diffMin + 2); d++) {
        const templateInput: TaskTemplateInput = {
          slug: tmpl.slug,
          promptTemplate: tmpl.promptTemplate,
          parameterSchema: tmpl.parameterSchema,
          difficultyRange: tmpl.difficultyRange,
          rubricTemplate: tmpl.rubricTemplate,
          goldSolution: tmpl.goldSolution,
        };

        const generated = generateTask(templateInput, d);

        await db.task.create({
          data: {
            templateId: template.id,
            capabilityId,
            moduleId,
            prompt: generated.prompt,
            difficulty: generated.difficulty,
            parameters: generated.parameters as any,
            rubric: generated.rubric as any,
            goldSolution: generated.goldSolution,
          },
        });
        taskCount++;
      }
    }
  }

  console.log(`\n✅ Seed complete!`);
  console.log(`   Course: ${course.title}`);
  console.log(`   Capabilities: ${capabilityMap.size}`);
  console.log(`   Modules: ${moduleMap.size}`);
  console.log(`   Templates: ${templateCount}`);
  console.log(`   Tasks generated: ${taskCount}`);
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
