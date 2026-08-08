export type RandomSource = () => number;

const randomIndex = (maximumInclusive: number, random: RandomSource) =>
  Math.min(
    maximumInclusive,
    Math.max(0, Math.floor(random() * (maximumInclusive + 1))),
  );

export const createShuffleBag = (
  itemCount: number,
  previousIndex: number | undefined,
  random: RandomSource = Math.random,
) => {
  if (!Number.isSafeInteger(itemCount) || itemCount <= 0) return [];
  const bag = Array.from({length: itemCount}, (_, index) => index);
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index, random);
    const value = bag[index];
    bag[index] = bag[swapIndex] ?? index;
    bag[swapIndex] = value ?? swapIndex;
  }
  if (itemCount <= 1 || previousIndex === undefined || bag[0] !== previousIndex)
    return bag;
  const replacementIndex = bag.findIndex(
    (candidate, index) => index > 0 && candidate !== previousIndex,
  );
  if (replacementIndex < 0) return bag;
  const first = bag[0];
  bag[0] = bag[replacementIndex] ?? 0;
  bag[replacementIndex] = first ?? previousIndex;
  return bag;
};
