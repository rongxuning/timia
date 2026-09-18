import assert from "node:assert/strict";
import { mock, describe, it } from "node:test";
import {
  createDebouncer,
  emptyPlace,
  geoSearchErrorKind,
  isPinnedPlace,
  itemLocationPayload,
  placeFromFreeText,
  placeFromItem,
  placeFromSearchHit,
  shouldSearchPlaces,
} from "./placeValue.ts";

describe("placeFromItem", () => {
  it("returns a pinned place when name and coords are present", () => {
    const place = placeFromItem({
      location: "星巴克",
      location_lat: 39.9836,
      location_lng: 116.3168,
    });
    assert.equal(isPinnedPlace(place), true);
    assert.deepEqual(place, { name: "星巴克", lat: 39.9836, lng: 116.3168 });
  });

  it("keeps free text without coords", () => {
    const place = placeFromItem({ location: "线上", location_lat: null, location_lng: null });
    assert.equal(isPinnedPlace(place), false);
    assert.deepEqual(place, { name: "线上", lat: null, lng: null });
  });

  it("drops orphan coords when the name is missing", () => {
    const place = placeFromItem({ location: "  ", location_lat: 1, location_lng: 2 });
    assert.deepEqual(place, { name: "", lat: null, lng: null });
  });
});

describe("placeFromSearchHit / placeFromFreeText", () => {
  it("pins a selected search hit", () => {
    const place = placeFromSearchHit({
      name: "星巴克（中关村大街店）",
      address: "北京市海淀区",
      lat: 39.98,
      lng: 116.31,
    });
    assert.equal(isPinnedPlace(place), true);
    assert.equal(place.name, "星巴克（中关村大街店）");
  });

  it("typing without selecting does not attach coordinates", () => {
    const place = placeFromFreeText("会议室 A");
    assert.equal(isPinnedPlace(place), false);
    assert.deepEqual(itemLocationPayload(place), {
      location: "会议室 A",
      location_lat: null,
      location_lng: null,
    });
  });
});

describe("itemLocationPayload", () => {
  it("sends the triple for a pinned chip", () => {
    assert.deepEqual(
      itemLocationPayload({ name: "星巴克", lat: 39.9, lng: 116.3 }),
      { location: "星巴克", location_lat: 39.9, location_lng: 116.3 },
    );
  });

  it("clears name and coords together", () => {
    assert.deepEqual(itemLocationPayload(emptyPlace()), {
      location: null,
      location_lat: null,
      location_lng: null,
    });
    assert.deepEqual(itemLocationPayload(placeFromFreeText("   ")), {
      location: null,
      location_lat: null,
      location_lng: null,
    });
  });
});

describe("shouldSearchPlaces", () => {
  it("requires two trimmed characters", () => {
    assert.equal(shouldSearchPlaces(""), false);
    assert.equal(shouldSearchPlaces(" 北 "), false);
    assert.equal(shouldSearchPlaces("北京"), true);
    assert.equal(shouldSearchPlaces("ab"), true);
  });
});

describe("createDebouncer", () => {
  it("only runs the latest callback after the delay", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const calls: string[] = [];
    const debounce = createDebouncer(300);
    debounce.schedule(() => calls.push("a"));
    debounce.schedule(() => calls.push("b"));
    mock.timers.tick(299);
    assert.deepEqual(calls, []);
    mock.timers.tick(1);
    assert.deepEqual(calls, ["b"]);
    debounce.cancel();
    mock.timers.reset();
  });
});

describe("geoSearchErrorKind", () => {
  it("maps 429 to rateLimited and other failures to unavailable", () => {
    assert.equal(geoSearchErrorKind({ status: 429, message: "geo_rate_limited" }), "rateLimited");
    assert.equal(geoSearchErrorKind({ status: 502, message: "geo_provider_error" }), "unavailable");
  });
});
