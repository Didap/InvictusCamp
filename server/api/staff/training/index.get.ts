import type { MyTrainingOption } from '#shared/types/staff'
import { myTraining } from '../../../domain/training'

/** «Formazione»: the trainings proposed, each with whether the signed-in person is interested. */
export default defineEventHandler(async (event): Promise<MyTrainingOption[]> => {
  const { user } = await requireStaff(event)
  return myTraining(useDb(), user.id)
})
