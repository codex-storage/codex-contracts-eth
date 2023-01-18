const RequestState = {
  New: 0,
  Started: 1,
  Cancelled: 2,
  Finished: 3,
  Failed: 4,
}

const SlotState = {
  Free: 0,
  Filled: 1,
  Finished: 2,
  Failed: 3,
  Paid: 4,
}

module.exports = { RequestState, SlotState }
