import type {
  QuestDefinition,
  QuestObjective,
  QuestObjectiveProgress,
  QuestPrerequisites,
  QuestProgressEntry,
  QuestReward,
} from '@/types/domain'

export interface QuestPrerequisiteContext {
  realmTier: number | null
  completedQuestIds: Set<string>
  clearedMonsterIds: Set<string>
  flags?: Set<string>
}

function isRealmRequirementMet(requirements: QuestPrerequisites | undefined, context: QuestPrerequisiteContext): boolean {
  if (!requirements?.minRealmTier) return true
  if (context.realmTier === null || context.realmTier === undefined) return false
  return context.realmTier >= requirements.minRealmTier
}

function isQuestChainRequirementMet(
  requirements: QuestPrerequisites | undefined,
  context: QuestPrerequisiteContext,
): boolean {
  if (!requirements?.requiredQuestIds?.length) return true
  return requirements.requiredQuestIds.every(id => context.completedQuestIds.has(id))
}

function isMonsterRequirementMet(
  requirements: QuestPrerequisites | undefined,
  context: QuestPrerequisiteContext,
): boolean {
  if (!requirements?.requiredMonsterIds?.length) return true
  return requirements.requiredMonsterIds.every(id => context.clearedMonsterIds.has(id))
}

function isFlagRequirementMet(requirements: QuestPrerequisites | undefined, context: QuestPrerequisiteContext): boolean {
  if (!requirements?.requiredFlags?.length) return true
  if (!context.flags) return false
  return requirements.requiredFlags.every(flag => context.flags?.has(flag))
}

export function isQuestAvailable(definition: QuestDefinition, context: QuestPrerequisiteContext): boolean {
  const requirements = definition.prerequisites
  if (!isRealmRequirementMet(requirements, context)) return false
  if (!isQuestChainRequirementMet(requirements, context)) return false
  if (!isMonsterRequirementMet(requirements, context)) return false
  if (!isFlagRequirementMet(requirements, context)) return false
  return true
}

export function createObjectiveProgress(objective: QuestObjective): QuestObjectiveProgress {
  return {
    objectiveId: objective.id,
    current: 0,
    completed: false,
  }
}

export function createProgressEntry(definition: QuestDefinition, acceptedAt: number): QuestProgressEntry {
  const objectives: Record<string, QuestObjectiveProgress> = {}
  definition.objectives.forEach(obj => {
    objectives[obj.id] = createObjectiveProgress(obj)
  })
  return {
    questId: definition.id,
    status: 'active',
    acceptedAt,
    completedAt: null,
    objectives,
  }
}

export function cloneQuestReward(reward: QuestReward): QuestReward {
  const cloned: QuestReward = {}
  if (typeof reward.gold === 'number') {
    cloned.gold = reward.gold
  }
  if (reward.items) {
    cloned.items = reward.items.map(item => ({ ...item }))
  }
  if (reward.equipmentTemplates) {
    cloned.equipmentTemplates = reward.equipmentTemplates.map(entry => ({ ...entry }))
  }
  if (reward.skillUnlocks) {
    cloned.skillUnlocks = [...reward.skillUnlocks]
  }
  if (typeof reward.notes === 'string') {
    cloned.notes = reward.notes
  }
  return cloned
}

export function areQuestObjectivesComplete(progress: QuestProgressEntry): boolean {
  const objectives = progress.objectives
  return Object.values(objectives).every(obj => obj.completed)
}

export function setObjectiveProgress(
  progress: QuestObjectiveProgress,
  amount: number,
  target: number,
): QuestObjectiveProgress {
  const nextAmount = Math.min(target, Math.max(0, amount))
  return {
    ...progress,
    current: nextAmount,
    completed: nextAmount >= target,
  }
}
