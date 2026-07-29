import {
  ARTICLE_CATEGORIES,
  getArticleCategoryLabel,
  isArticleCategoryCode,
  type ArticleCategoryCode,
} from "./article-taxonomy";

export const SOURCE_CATEGORIES = ARTICLE_CATEGORIES;

export type SourceCategoryCode = ArticleCategoryCode;

export function isSourceCategoryCode(value: unknown): value is SourceCategoryCode {
  return isArticleCategoryCode(value);
}

export function getSourceCategoryLabel(code: string): string {
  return getArticleCategoryLabel(code);
}
