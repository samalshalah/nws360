import { useTranslation } from "react-i18next";
import { LANGUAGES, getDirection } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang);
    const dir = getDirection(lang);
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  };

  return (
    <Select value={i18n.language?.split("-")[0] || "en"} onValueChange={handleChange}>
      <SelectTrigger
        className={compact ? "w-auto gap-1.5 bg-transparent border-none" : "w-[140px]"}
        data-testid="select-language"
      >
        <Globe className="w-4 h-4 shrink-0" />
        {!compact && <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code} data-testid={`lang-option-${lang.code}`}>
            {lang.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
