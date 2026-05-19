export async function runVerifierEntrypoint({ main, onError }) {
  try {
    await main()
  } catch (error) {
    await onError(error)
  }
}
