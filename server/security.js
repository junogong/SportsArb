import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({ region: "us-east-1" });

/**
 * Fetches a parameter from AWS Systems Manager Parameter Store.
 * @param {string} name - The parameter name (e.g., /arb-finder/odds-api-key)
 * @param {string} fallback - A local fallback value (from .env)
 * @returns {Promise<string>}
 */
export async function getSecret(name, fallback = null) {
    try {
        const command = new GetParameterCommand({
            Name: name,
            WithDecryption: true,
        });
        const response = await ssmClient.send(command);
        if (response.Parameter?.Value) {
            console.log(`[SECURITY] Fetched ${name} from AWS Parameter Store.`);
            return response.Parameter.Value;
        }
    } catch (err) {
        if (err.name === 'ParameterNotFound') {
            console.warn(`[SECURITY] Parameter ${name} not found in AWS. Using local fallback.`);
        } else {
            console.error(`[SECURITY] Error fetching parameter ${name}:`, err.message);
        }
    }

    return fallback;
}
