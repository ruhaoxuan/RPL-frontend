import type { Plugin, Connect } from "vite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SyncService } from "./service.ts";
export function localSyncPlugin(): Plugin {
  let root: string, base: string;
  const install = (middlewares: Connect.Server) => {
    const service = new SyncService(root);
    const stop =
      process.env.RPL_AUTO_CHECK === "0" ? () => {} : service.startScheduler();
    middlewares.use(async (req, res, next) => {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      const prefix = (base === "./" ? "/" : base) + "api/data-sources";
      const generated = (base === "./" ? "/" : base) + "generated/";
      const api = pathname === prefix || pathname.startsWith(prefix + "/");
      const asset = pathname.startsWith(generated)
        ? pathname.slice(generated.length)
        : null;
      if (!api && !asset) return next();
      const host = req.headers.host || "";
      const hostname = host.replace(/:\d+$/, "");
      const remote = req.socket.remoteAddress;
      const local =
        ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote || "") &&
        ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
      const sameOrigin =
        !req.headers.origin || req.headers.origin === `http://${host}`;
      const respond = (status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(body));
      };
      if (
        !local ||
        !sameOrigin ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return respond(403, { message: "仅允许本机同源访问同步服务。" });
      try {
        if (asset) {
          if (req.method !== "GET" || !/^[a-zA-Z0-9_.-]+\.json$/.test(asset))
            return next();
          const contents = await readFile(
            path.join(root, "public/generated", asset),
            "utf8",
          );
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(contents);
          return;
        }
        if (req.method === "GET" && pathname === prefix)
          return respond(200, await service.state());
        const match = pathname
          .slice(prefix.length)
          .match(/^\/([a-zA-Z0-9_-]+)\/(sync|check)$/);
        if (req.method === "POST" && match) {
          if (req.headers["x-rpl-sync"] !== "1")
            return respond(403, { message: "缺少同步请求标识。" });
          return respond(
            202,
            await service.start(match[1], match[2] as "sync" | "check"),
          );
        }
        respond(404, { message: "接口不存在。" });
      } catch (error) {
        if (asset) return next();
        const e = error as Error & { statusCode?: number };
        respond(e.statusCode || 500, {
          message: e.statusCode
            ? e.message
            : "同步服务暂不可用，请查看终端日志。",
        });
      }
    });
    return stop;
  };
  return {
    name: "local-data-source-sync",
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    configureServer(server) {
      const stop = install(server.middlewares);
      server.httpServer?.once("close", stop);
    },
    configurePreviewServer(server) {
      const stop = install(server.middlewares);
      server.httpServer?.once("close", stop);
    },
  };
}
