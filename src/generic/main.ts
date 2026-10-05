/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import {
  BasicRateLimiter,
  ContentRating,
  CookieStorageInterceptor,
  DiscoverSectionType,
  Form,
  PaperbackInterceptor,
  URL,
  type Chapter,
  type ChapterDetails,
  type Cookie,
  type DiscoverSection,
  type DiscoverSectionItem,
  type ExtensionImpl,
  type PagedResults,
  type Request,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
  type Tag,
  type TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";

import type { basePbConfig } from "./config";
import { getUsePostIds, KemonoSearchForm, KemonoSettings } from "./forms";
import { SORTING_OPTIONS, type KemonoPostResponse, type KemonoSearchMetadata } from "./models";
import { KemonoInterceptor } from "./network";
import { KemonoParser } from "./parsers";

export interface GenericParams {
  name: string;
  domain: string;
  contentRating: ContentRating;
  language: string;
  useApi?: boolean;
  apiPath?: string;
  parser?: KemonoParser;
  requestManager?: PaperbackInterceptor;
  userAgent?: string;
}

type Metadata = {
  page?: number;
  completed?: boolean;
};

export abstract class KemonoGeneric implements ExtensionImpl<typeof basePbConfig> {
  /**
   * The Kemono URL of the website. Eg. https://webtoon.xyz
   */
  readonly domain: string;

  /**
   * The readable name of the website. Eg. Toonily
   */
  readonly name: string;

  /**
   * The default content rating. Eg. Hiperdex = Adult
   */
  readonly defaultContentRating: ContentRating;

  /**
   * The language code the source's content is served in in string form.
   */
  readonly language?: string;

  /**
   * For now only true
   */
  readonly useApi?: boolean;

  /**
   * The path for the api
   */
  readonly apiPath?: string;

  /**
   * Allows providing a custom user agent without replacing the whole interceptor.
   */
  readonly userAgent?: string;

  parser: KemonoParser;

  requestManager: PaperbackInterceptor;

  /**
   *
   */
  constructor(params: GenericParams) {
    this.name = params.name;
    this.domain = params.domain;
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
    this.language = params.language ?? "🇬🇧";
    this.useApi = params.useApi ?? true;
    this.apiPath = params.apiPath ?? "/api/v1";
    this.parser = params.parser ?? new KemonoParser();
    this.requestManager = params.requestManager ?? new KemonoInterceptor("main", this);
    this.userAgent = params.userAgent;
  }

  globalRateLimiter = new BasicRateLimiter("ratelimiter", {
    numberOfRequests: 20,
    bufferInterval: 1,
    ignoreImages: true,
  });

  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });

  async initialise(): Promise<void> {
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
    this.requestManager?.registerInterceptor();
  }

  async getSettingsForm(): Promise<Form> {
    return new KemonoSettings(this.name, this.domain);
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const [_response, buffer] = await Application.scheduleRequest({
      url: getUsePostIds(this.usePostIds)
        ? `${this.domain}/?p=${mangaId}/`
        : `${this.domain}/temp_dirpath/${mangaId}/`,
      method: "GET",
    });

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));
    return this.parser.parseMangaDetails($, mangaId, this);
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    let requestConfig: Request;
    const mangaId = await this.getPostAndSlug(sourceManga.mangaId);

    switch (this.chapterEndpoint) {
      case 0:
        requestConfig = {
          url: `${this.domain}/wp-admin/admin-ajax.php`,
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: `action=manga_get_chapters&manga=${encodeURIComponent(mangaId.postId)}`,
        };
        break;

      case 1:
        requestConfig = {
          url: `${this.domain}/temp_dirpath/${mangaId.slug}/ajax/chapters`,
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
        };
        break;

      case 2:
        requestConfig = {
          url: `${this.domain}/temp_dirpath/${mangaId.slug}`,
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
        };
        break;

      case 3:
        requestConfig = {
          url: `${this.domain}/temp_dirpath/${mangaId.slug}`,
          method: "GET",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
        };
        break;

      default:
        throw new Error("Invalid chapter endpoint!");
    }

    const [_response, buffer] = await Application.scheduleRequest(requestConfig);

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    return this.parser.parseChapterList($, sourceManga, this);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaId = await this.getPostAndSlug(chapter.sourceManga.mangaId);
    const chapterId = chapter.chapterId;

    const url = new URL(this.domain).addPathComponent("temp_dirpath");
    url.addPathComponent(mangaId.slug);

    url.addPathComponent(chapterId);

    if (this.useListParameter) {
      url.setQueryItem("style", "list");
    }

    const [_response, buffer] = await Application.scheduleRequest({
      url: url.toString(),
      method: "GET",
    });

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    if (this.hasProtectedChapters) {
      return this.parser.parseProtectedChapterDetails(
        $,
        chapter,
        this.protectedChapterDataSelector,
        this,
      );
    }

    return this.parser.parseChapterDetails($, chapter, this.chapterDetailsSelector, this);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "new_series",
        title: "New Series",
        type: DiscoverSectionType.featured,
      },
      {
        id: "recently_updated",
        title: "Recently Updated",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "currently_trending",
        title: "Currently Trending",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "most_popular",
        title: "Most Popular",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    let param = "";
    const page = metadata?.page ?? 1;

    switch (section.id) {
      case "new_series":
        param = "?m_orderby=new-manga";
        break;
      case "recently_updated":
        param = "?m_orderby=latest";
        break;
      case "currently_trending":
        param = "?m_orderby=trending";
        break;
      case "most_popular":
        param = "?m_orderby=views";
        break;

      default:
        throw new Error("Invalid sectionId provided!");
    }

    const [_response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/temp_dirpath/page/${page}/${param}`,
      method: "GET",
    });

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    const items = await this.parser.parseDiscoverSections($, section, this);

    metadata = { page: page + 1 }; // Kemono doesn't support last page checking, will return 404 on website!

    return {
      items: items,
      metadata: metadata,
    };
  }

  async fetchGenres(): Promise<Tag[]> {
    const [_response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/?s=&post_type=wp-manga`,
      method: "GET",
    });

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    const tagSections = await this.parser.parseSearchTags($);
    const genreTags = tagSections.find((x) => x.id === "genres") as TagSection;

    return genreTags.tags;
  }

  async getAdvancedSearchForm(query: SearchQuery<KemonoSearchMetadata>): Promise<KemonoSearchForm> {
    return new KemonoSearchForm(query.metadata, this.fetchGenres());
  }

  async getSortingOptions(): Promise<SortingOption[]> {
    return SORTING_OPTIONS;
  }

  async getSearchResults(
    query: SearchQuery<KemonoSearchMetadata>,
    metadata: Metadata | undefined,
    sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;

    const [_response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}${this.apiPath}/posts`,
      headers: {
        "Accept": "text/css"
      },
      method: "GET",
    });

    if (_response.status === 404) {
      return { items: [], metadata: undefined }; // Kemono doesn't support last page checking, will return 404 on website!
    }

    const content = JSON.parse(Application.arrayBufferToUTF8String(buffer)) as KemonoPostResponse;
 
    const items = content.posts.map(post => {
      return {
        mamgaId: `${post.service}-${post.user}-${post.id}`,
        title: post.title,
        subtitle: post.substring,
        imageUrl: this.domain+getImageFromPost(post)
      }
    });

    return items;
  }
}
function getImageFromPost(): any {
  throw new Error("Function not implemented.");
}

