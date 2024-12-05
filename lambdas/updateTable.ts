import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SNSEvent } from "aws-lambda";

const dynamoDb = new DynamoDBClient({ region: process.env.AWS_REGION });


export const handler = async (event: SNSEvent) => {
    console.log("Received SNS Event:", JSON.stringify(event, null, 2));

    for (const record of event.Records) {
        const snsMessage = JSON.parse(record.Sns.Message);

        // Extract values from SNS message
        const metadataType = record.Sns.MessageAttributes.metadata_type?.Value;
        const fileName = snsMessage.id; // Match partition key 'fileName'
        const metadataValue = snsMessage.value;

        // DynamoDB Update Parameters
        const params = {
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Key: { fileName: { S: fileName } }, // Use 'fileName' as key
            UpdateExpression: "SET #meta = :value",
            ExpressionAttributeNames: {
                "#meta": metadataType, // Metadata type as attribute name
            },
            ExpressionAttributeValues: {
                ":value": { S: metadataValue }, // Metadata value as attribute value
            },
        };

        // Perform the update operation
        try {
            await dynamoDb.send(new UpdateItemCommand(params));
            console.log(`Successfully updated item: ${fileName}`);
        } catch (error) {
            console.error("Error updating DynamoDB:", error);
            throw error;
        }
    }
};