import { describe, expect, it } from "vitest";
import { ScrollModel } from "./scroll.js";

describe("scroll model", () => {
  it("follows the end while content grows", () => {
    const scroll = new ScrollModel();
    scroll.updateLayout(3, 2);
    expect(scroll.scrollTop).toBe(1);
    scroll.updateLayout(6, 2);
    expect(scroll.scrollTop).toBe(4);
    expect(scroll.isFollowingEnd).toBe(true);
  });

  it("holds its content row once scrolled back, whatever arrives after", () => {
    const scroll = new ScrollModel();
    scroll.updateLayout(3, 2);
    expect(scroll.scrollBy(-1)).toBe(0);
    expect(scroll.scrollTop).toBe(0);
    expect(scroll.isFollowingEnd).toBe(false);
    scroll.updateLayout(9, 2);
    expect(scroll.scrollTop).toBe(0);
    expect(scroll.isFollowingEnd).toBe(false);
  });

  it("reports the part of a move it could not honour", () => {
    const scroll = new ScrollModel();
    scroll.updateLayout(10, 4);
    expect(scroll.scrollBy(-3)).toBe(0);
    expect(scroll.scrollTop).toBe(3);
    expect(scroll.scrollBy(-100)).toBe(-97);
    expect(scroll.scrollTop).toBe(0);
    expect(scroll.scrollBy(1_000)).toBe(994);
    expect(scroll.scrollTop).toBe(6);
    expect(scroll.isFollowingEnd).toBe(true);
    expect(scroll.scrollBy(1)).toBe(1);
  });

  it("resumes following once it is back at the last row", () => {
    const scroll = new ScrollModel();
    scroll.updateLayout(10, 4);
    scroll.scrollBy(-2);
    expect(scroll.isFollowingEnd).toBe(false);
    scroll.scrollBy(2);
    expect(scroll.isFollowingEnd).toBe(true);
  });

  it("jumps to the start and the end", () => {
    const scroll = new ScrollModel();
    scroll.updateLayout(10, 4);
    scroll.scrollToStart();
    expect(scroll.scrollTop).toBe(0);
    expect(scroll.isFollowingEnd).toBe(false);
    scroll.scrollToEnd();
    expect(scroll.scrollTop).toBe(6);
    expect(scroll.isFollowingEnd).toBe(true);
  });

  it("clamps a requested row into the content", () => {
    const scroll = new ScrollModel();
    scroll.updateLayout(10, 4);
    scroll.scrollTo(100);
    expect(scroll.scrollTop).toBe(6);
    expect(scroll.isFollowingEnd).toBe(true);
    scroll.scrollTo(-5);
    expect(scroll.scrollTop).toBe(0);
    expect(scroll.isFollowingEnd).toBe(false);
    scroll.scrollTo(2);
    expect(scroll.scrollTop).toBe(2);
  });
});
