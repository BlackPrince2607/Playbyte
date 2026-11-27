import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { momentShareBody, scoreShareBody, withAppDownloadLink } from "./shareMessage";

const LINK = "https://play.google.com/store/apps/details?id=app.maja.mobile";

describe("withAppDownloadLink", () => {
  it("appends the download link on its own line", () => {
    assert.equal(
      withAppDownloadLink("I scored 101 on Fruit Frenzy.", LINK),
      `I scored 101 on Fruit Frenzy.\n${LINK}`,
    );
  });

  it("does not duplicate the link when already present", () => {
    const once = withAppDownloadLink(`Beat my score!\n${LINK}`, LINK);
    assert.equal(once, `Beat my score!\n${LINK}`);
    assert.equal(withAppDownloadLink(once, LINK), once);
  });

  it("returns just the link when the body is empty", () => {
    assert.equal(withAppDownloadLink("  ", LINK), LINK);
  });
});

describe("scoreShareBody / momentShareBody", () => {
  it("always ends with the app download link", () => {
    const score = scoreShareBody("I scored 10 on Flags.", LINK);
    const moment = momentShareBody("I just played this on MAJA.", LINK);
    assert.ok(score.endsWith(LINK));
    assert.ok(moment.endsWith(LINK));
    assert.equal(score.split("\n").length, 2);
    assert.equal(moment.split("\n").length, 2);
  });
});
