import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SNSEvent } from "aws-lambda";

const dynamoDb = new DynamoDBClient({ region: process.env.AWS_REGION });


export const handler = async (event: SNSEvent) => {
    console.log("Received SNS Event:", JSON.stringify(event, null, 2));

    // parse each record in the sns event
    for (const record of event.Records) {
        //parse the sns message body
        const snsMessage = JSON.parse(record.Sns.Message);

        // Extract metadata type, file name, and metadata value from the SNS message
        const metadataType = record.Sns.MessageAttributes.metadata_type?.Value;
        const fileName = snsMessage.id; // file name is partition key so match it 
        const metadataValue = snsMessage.value;

        // DynamoDB Update Parameters
        const params = {
            TableName: process.env.DYNAMODB_TABLE_NAME,
            Key: { fileName: { S: fileName } }, // 'file name will be used as key
            UpdateExpression: "SET #meta = :value",
            ExpressionAttributeNames: {
                "#meta": metadataType, // Meta data type is attribute name
            },
            ExpressionAttributeValues: {
                ":value": { S: metadataValue }, // meta data value as the value
            },
        };

        // Update the dynamodb table
        try {
            await dynamoDb.send(new UpdateItemCommand(params));
            console.log(`Successfully updated item: ${fileName}`);
        } catch (error) {
            console.error("Error updating DynamoDB:", error);
            throw error;
        }
    }
};