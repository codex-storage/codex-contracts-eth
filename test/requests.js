const { Assertion } = require("chai")
const { currentTime } = require("./evm")

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
  Cancelled: 5,
}

function enableRequestAssertions() {
  // language chain method
  Assertion.addMethod("request", function (request) {
    var actual = this._obj

    this.assert(
      actual.client === request.client,
      "expected request #{this} to have client #{exp} but got #{act}",
      "expected request #{this} to not have client #{act}, expected #{exp}",
      request.client, // expected
      actual.client // actual
    )
    this.assert(
      actual.expiry == request.expiry,
      "expected request #{this} to have expiry #{exp} but got #{act}",
      "expected request #{this} to not have expiry #{act}, expected #{exp}",
      request.expiry, // expected
      actual.expiry // actual
    )
    this.assert(
      actual.nonce === request.nonce,
      "expected request #{this} to have nonce #{exp} but got #{act}",
      "expected request #{this} to not have nonce #{act}, expected #{exp}",
      request.nonce, // expected
      actual.nonce // actual
    )
  })
}

module.exports = {
  RequestState,
  SlotState,
  enableRequestAssertions,
}
