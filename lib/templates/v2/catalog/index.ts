import type { TemplateSpec } from "../spec";
import { BUSINESS, CELEBRATIONS, EDUCATION, EVENTS, GAMING, INTROS, PODCAST, QUOTES, SALES, SHORTS, SLIDESHOWS, SOCIAL } from "./more";
import { YOUTUBE } from "./youtube";

/** Every template written with the v2 spec, by category. */
export const V2_TEMPLATES: TemplateSpec[] = [...YOUTUBE, ...INTROS, ...SHORTS, ...SOCIAL, ...GAMING, ...BUSINESS, ...SALES, ...SLIDESHOWS, ...CELEBRATIONS, ...EDUCATION, ...PODCAST, ...QUOTES, ...EVENTS];
export const V2_BY_ID = new Map(V2_TEMPLATES.map((t) => [t.id, t]));
