import { z } from 'zod'
import { PROGRAMME_GROUPS } from '../utils/constants'
import { zUuid } from './common'

/** The activity group of a family in a session (docs/spec.md 3.12); null takes it out. */
export const groupAssignmentSchema = z.object({ group: z.enum(PROGRAMME_GROUPS).nullable() })

/** Who leads a group: a convocation of the session; null leaves the group without one. */
export const groupLeaderSchema = z.object({ group: z.enum(PROGRAMME_GROUPS), convocationId: zUuid.nullable() })
