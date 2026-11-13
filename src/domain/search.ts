import { type Catalog, type Pattern } from "./model";
export function selectPatterns(
  data: Catalog,
  params: URLSearchParams,
): Pattern[] {
  const terms = (params.get("q") || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const fileMap = new Map(data.files.map((x) => [x.id, x]));
  return data.patterns
    .filter((p) => {
      const cases = data.instances.filter((x) => x.patternIds.includes(p.id));
      const text = [
        p.id,
        p.name,
        p.description,
        ...p.tags,
        ...p.externalIds,
        ...p.diagNames,
        fileMap.get(p.fileId)?.path,
        ...cases.map((x) => fileMap.get(x.fileId)?.path),
      ]
        .join(" ")
        .toLowerCase();
      return (
        terms.every((t) => text.includes(t)) &&
        (!params.get("source") || p.source === params.get("source")) &&
        (!params.get("status") || p.detectionStatus === params.get("status")) &&
        (!params.get("tag") || p.tags.includes(params.get("tag")!)) &&
        (!params.get("type") ||
          cases.some((x) => x.type === params.get("type"))) &&
        (!params.get("has") ||
          (params.get("has") === "yes" ? cases.length > 0 : cases.length === 0))
      );
    })
    .sort((a, b) =>
      params.get("sort") === "name"
        ? a.name.localeCompare(b.name)
        : params.get("sort") === "count"
          ? data.instances.filter((x) => x.patternIds.includes(b.id)).length -
              data.instances.filter((x) => x.patternIds.includes(a.id))
                .length || a.name.localeCompare(b.name)
          : (fileMap.get(b.fileId)?.updatedAt || "").localeCompare(
              fileMap.get(a.fileId)?.updatedAt || "",
            ) || a.name.localeCompare(b.name),
    );
}
