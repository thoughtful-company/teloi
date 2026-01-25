export interface TextRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  textNode: Text;
  textOffset: number; // character offset calculated based on previous nodes
}

export interface Line {
  lineNumber: number;
  rects: [TextRect, ...TextRect[]];
  left: number;
  right: number;
  top: number;
  bottom: number;
}
