export type ByteRange = {end: number; start: number};

export const constrainByteRangeLength = (range: ByteRange, maximumLength: number): ByteRange => {
  if (!Number.isSafeInteger(maximumLength) || maximumLength <= 0)
    throw new RangeError("maximum byte range length must be a positive integer");
  const length = Math.min(maximumLength, range.end - range.start + 1);
  return {end: range.start + length - 1, start: range.start};
};

export const parseByteRange = (header: string | undefined, size: number): ByteRange | undefined | "invalid" => {
  if (!header) return;
  if (!Number.isSafeInteger(size) || size <= 0) return "invalid";
  const match = header.match(/^bytes=([0-9]*)-([0-9]*)$/u);
  if (!match) return "invalid";
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (!startText && !endText) return "invalid";

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    return {end: size - 1, start: Math.max(0, size - suffixLength)};
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  )
    return "invalid";
  return {end: Math.min(requestedEnd, size - 1), start};
};
