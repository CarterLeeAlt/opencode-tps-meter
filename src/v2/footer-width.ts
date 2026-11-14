import { BoxRenderable, isRenderable, TextBufferRenderable, Yoga, type BaseRenderable, type Renderable } from "@opentui/core";
import stringWidth from "string-width";

/** Solid's slot markers have no layout box of their own. */
function layoutChildren(node: BaseRenderable): Renderable[] {
  return node.getChildren().flatMap((child) =>
    !child.visible ? [] : isRenderable(child) ? [child] : layoutChildren(child)
  );
}

/** The width occupied by content, excluding blank space awarded by flex-grow. */
function contentWidth(node: Renderable): number {
  const padding = edges(node, "padding", node.width);
  if (node instanceof TextBufferRenderable) return padding + stringWidth(node.plainText);
  const children = layoutChildren(node);
  if (children.length === 0) return node instanceof BoxRenderable ? padding : node.width;
  const widths = children.map((child) => contentWidth(child) + edges(child, "margin", node.width));
  return padding + (node.primaryAxis === "row"
    ? widths.reduce((sum, width) => sum + width, 0) + columnGap(node) * (children.length - 1)
    : Math.max(...widths));
}

function columns(reference: number, ...values: Yoga.Value[]): number {
  const value = values.find((value) => value.unit !== Yoga.Unit.Undefined);
  if (!value) return 0;
  if (value.unit === Yoga.Unit.Point) return value.value;
  if (value.unit === Yoga.Unit.Percent) return value.value * reference / 100;
  return 0;
}

function columnGap(node: Renderable): number {
  return columns(node.width, node.getGap(Yoga.Gutter.Column), node.getGap(Yoga.Gutter.All));
}

function edges(node: Renderable, kind: "padding" | "margin", reference: number): number {
  const get = (edge: Yoga.Edge) => kind === "padding" ? node.getPadding(edge) : node.getMargin(edge);
  const horizontal = get(Yoga.Edge.Horizontal);
  const all = get(Yoga.Edge.All);
  return columns(reference, get(Yoga.Edge.Left), horizontal, all)
    + columns(reference, get(Yoga.Edge.Right), horizontal, all);
}

/** Fits beside the host's actual content while retaining its existing gaps and right edge. */
export function availableFooterWidth(meter: Renderable): number {
  let parent = (meter as BaseRenderable).parent;
  while (parent && !isRenderable(parent)) parent = parent.parent;
  if (!parent) return 0;
  if (parent.primaryAxis !== "row") return parent.width;
  const siblings = layoutChildren(parent);
  const occupied = edges(parent, "padding", parent.width)
    + columnGap(parent) * Math.max(0, siblings.length - 1)
    + siblings.reduce((sum, sibling) => sum + edges(sibling, "margin", parent.width) + (sibling === meter ? 0 : contentWidth(sibling)), 0);
  return Math.max(0, Math.floor(parent.width - occupied));
}
