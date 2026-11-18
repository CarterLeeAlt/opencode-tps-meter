import { BoxRenderable, isRenderable, TextBufferRenderable, Yoga, type BaseRenderable, type Renderable } from "@opentui/core";
import stringWidth from "string-width";

/** Solid's slot markers have no layout box of their own. */
function layoutChildren(node: BaseRenderable): Renderable[] {
  return node.getChildren().flatMap((child) =>
    !child.visible ? [] : isRenderable(child) ? [child] : layoutChildren(child)
  );
}

/** Whether a renderable branch contains the meter, possibly through wrapper nodes. */
function contains(node: BaseRenderable, target: BaseRenderable): boolean {
  if (node === target) return true;
  return node.getChildren().some((child) => child.visible && contains(child, target));
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

interface FooterRow {
  readonly row: Renderable;
  readonly siblings: Renderable[];
  readonly meterBranch: Renderable;
}

/** Finds the footer row without treating the meter's own row as the host footer. */
function findFooterRow(meter: Renderable): FooterRow | undefined {
  let parent = (meter as BaseRenderable).parent;
  while (parent) {
    if (isRenderable(parent) && parent.primaryAxis === "row") {
      const siblings = layoutChildren(parent);
      const meterBranch = siblings.find((sibling) => contains(sibling, meter));
      if (meterBranch && siblings.some((sibling) => sibling !== meterBranch)) {
        return { row: parent, siblings, meterBranch };
      }
    }
    parent = parent.parent;
  }
  return undefined;
}

/** Stable outer width used to detect a real footer resize. */
export function footerLayoutWidth(meter: Renderable): number {
  return findFooterRow(meter)?.row.width ?? 0;
}

/** Fits beside the host's actual content while retaining its existing gaps and right edge. */
export function availableFooterWidth(meter: Renderable): number {
  // A slot may be wrapped in a renderable container before it is inserted into the
  // footer row. Find the first row that has a *different* sibling as well; measuring
  // the meter's own row would either produce zero or, worse, include the meter's text
  // in the occupied width and create a layout feedback loop.
  const footer = findFooterRow(meter);
  if (!footer) {
    // A standalone footer has no host content to share. Keep the old safe fallback
    // for hosts whose slot tree exposes no enclosing row.
    let fallback = (meter as BaseRenderable).parent;
    while (fallback && !isRenderable(fallback)) fallback = fallback.parent;
    return fallback && fallback.primaryAxis !== "row" ? fallback.width : 0;
  }
  const { row, siblings, meterBranch } = footer;
  const occupied = edges(row, "padding", row.width)
    + columnGap(row) * Math.max(0, siblings.length - 1)
    + siblings.reduce((sum, sibling) => sum + edges(sibling, "margin", row.width) + (sibling === meterBranch ? 0 : contentWidth(sibling)), 0);
  return Math.max(0, Math.floor(row.width - occupied));
}
