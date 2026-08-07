import { useQuery } from "@tanstack/react-query";
import { listTaskCatalog } from "./catalogRepository";

export function useTaskCatalog() {
  return useQuery({ queryKey: ["task-catalog"], queryFn: listTaskCatalog, staleTime: 5 * 60_000 });
}
