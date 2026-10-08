# Integrations

No payment, POS/acquirer, payout or BBPS provider was selected or credentialed by the user. `src/integrations/provider.js` establishes an interface and its default behavior is an explicit 503. It is not a provider adapter or sandbox implementation.

Obtain the providers' official sandbox credentials, webhook specifications/secrets, method enablement, merchant onboarding approval, biller/service catalog and written production approval from each contracted provider. POS also needs acquiring/terminal certification and settlement reporting. BBPS services require applicable agent/biller authorization. Payout services require an approved partner and verified beneficiary mechanism. Validate signatures, event IDs, amounts, currency, references and state transitions against official provider documentation and sandbox tests before enabling.

Do not invent sample provider success in production. Any future simulator belongs only under an explicit test profile and must never be compiled or configured into production.
