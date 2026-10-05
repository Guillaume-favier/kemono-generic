/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { KemonoGeneric } from "../generic/main";
import pbconfig from "./pbconfig";

const DOMAIN: string = "https://kemono.cr";

class KemonoCrExtension extends KemonoGeneric {
  constructor() {
    super({
      domain: DOMAIN,
      name: pbconfig.name,
      contentRating: pbconfig.contentRating,
      language: pbconfig.language,
    });
  }
}

export const KemonoCr = new KemonoCrExtension();
