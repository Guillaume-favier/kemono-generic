/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import type { SortingOption } from "@paperback/types";


// Mapping of the responses from the Kemono API

export type KemonoFile = {
  name: string,
  path: string
}

export type KemonoPost = {
  id: string,
  user: string,
  service: string,
  title: string,
  substring: string,
  published: string,
  file: Partial<KemonoFile>,
  attachments: KemonoFile[]
}

export type KemonoPostResponse = {
  count: number,
  true_count: number,
  posts: KemonoPost[]
}

// Kemono extrension types and values

export const validImageExt = [
  "png", "jpg", "jpeg", "gif", "webp"
]

export type KemonoSearchMetadata = {
  genres?: Record<string, "included" | "excluded">;
};

// `id` maps to Madara's `m_orderby` value; "relevance" is the default (no param).
export const SORTING_OPTIONS: SortingOption[] = [
  { id: "relevance", label: "Relevance" },
  { id: "latest", label: "Latest" },
  { id: "alphabet", label: "A-Z" },
  { id: "rating", label: "Rating" },
  { id: "trending", label: "Trending" },
  { id: "views", label: "Views" },
  { id: "new-manga", label: "New" },
];
