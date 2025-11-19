export interface MonsterBlueprint {
  id: string;
  name: string;
  realmTier: number;
  hp: number;
  bp: number;
  specialization: string;
  rewards: Record<string, number>;
  rank?: string;
  attackInterval?: [number, number];
  [key: string]: unknown;
}

export interface AssetStatus {
  png: boolean;
  webp: boolean;
  mp4: boolean;
}
