import type { VideoMetadata, MetadataClaim, MetadataStatus, MetadataReason } from "./video-metadata";

export type Technique = {
  id: string;
  user_id: string;
  name: string;
  discipline: string;
  position: string;
  category: string;
  source: string;
  url: string;
  created_at: string;
  updated_at: string;
  revision: number;
};

export type TechniqueDraft = Pick<Technique,
  "name" | "discipline" | "position" | "category" | "source" | "url">;

export type Database = {
  public: {
    Tables: {
      video_metadata: {
        Row: VideoMetadata & { request_token: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      techniques: {
        Row: Technique;
        Insert: TechniqueDraft & { user_id: string };
        Update: Partial<Pick<Technique, "name" | "discipline" | "position" | "category">>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_video_metadata: {
        Args: { p_id: string; p_refresh?: boolean };
        Returns: MetadataClaim;
      };
      finish_video_metadata: {
        Args: { p_id: string; p_token: string; p_status: Exclude<MetadataStatus, "processing">;
          p_reason: MetadataReason; p_title: string; p_author: string; p_thumbnail: string };
        Returns: VideoMetadata;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export function cleanField(value: string): string {
  const text = value.trim();
  return ["pendiente", "sin clasificar"].includes(text.toLowerCase()) ? "" : text;
}

export function isPending(item: Technique): boolean {
  return ![item.discipline, item.position, item.category].some(value => cleanField(value));
}
