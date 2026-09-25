import m0000 from './20260924120912_init/migration.sql'
import m0001 from './20260925175520_aggregate-checkpoints/migration.sql'

export default {
  migrations: {
    '20260924120912_init': m0000,
    '20260925175520_aggregate-checkpoints': m0001,
  },
}
