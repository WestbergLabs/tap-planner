export type BrewPack = {
  id: string;
  name: string;
  recommendedBrewDays: number;
  recommendedConditioningDays: number;
  minimumBrewDays: number;
  minimumConditioningDays: number;
};

export const brewPacks: BrewPack[] = [
  {
    id: "whole-nine-yards",
    name: "Whole Nine Yards",
    recommendedBrewDays: 8,
    recommendedConditioningDays: 3,
    minimumBrewDays: 6,
    minimumConditioningDays: 2,
  },
  {
    id: "dark-matter",
    name: "Dark Matter",
    recommendedBrewDays: 5,
    recommendedConditioningDays: 7,
    minimumBrewDays: 4,
    minimumConditioningDays: 5,
  },
  {
    id: "fresh-press",
    name: "Fresh Press",
    recommendedBrewDays: 8,
    recommendedConditioningDays: 3,
    minimumBrewDays: 6,
    minimumConditioningDays: 2,
  },
];