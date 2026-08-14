import { closeDatabase } from "./client.server";
import { seedDatabase } from "./seed";

try {
  await seedDatabase();
  console.info("Database seed completed");
} catch (error) {
  console.error("Database seed failed", error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
