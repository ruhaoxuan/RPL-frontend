import { SyncService } from "./sync/service.ts";
const args = process.argv.slice(2);
if (args.length > 1) throw Error("用法：npm run data:updates -- [数据源ID]");
const service = new SyncService(process.cwd());
const job = await service.start(args[0] || "rpl", "check");
while (job.status === "running")
  await new Promise((resolve) => setTimeout(resolve, 100));
console.log(job.message);
if (job.status === "failed") process.exitCode = 1;
