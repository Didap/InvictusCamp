import type { TrainingOptionDto } from '#shared/types/staff'
import { trainingOptionsWithPeople } from '../../../domain/training'

/** «Formazione»: the trainings proposed, with who is interested. */
export default defineEventHandler(async (event): Promise<TrainingOptionDto[]> => {
  await requireAdmin(event)
  return trainingOptionsWithPeople(useDb())
})
