import { useQuery } from "@tanstack/react-query";
import type { EmbassyProfile } from "@shared/article-taxonomy";

type PublicSettingsWithProfile = {
  embassyProfile?: EmbassyProfile | null;
};

export function useEmbassyProfile(): EmbassyProfile | null {
  const { data } = useQuery<PublicSettingsWithProfile>({
    queryKey: ["/api/settings/public"],
  });
  return data?.embassyProfile || null;
}
