import { UserRole } from "@prisma/client";

const roleStyles: Record<UserRole, string> = {
  STUDENT: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  PARENT: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  GUIDE: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  ADMIN: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${roleStyles[role]}`}
    >
      {role}
    </span>
  );
}
