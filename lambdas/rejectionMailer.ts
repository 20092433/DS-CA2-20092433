import { SQSHandler } from 'aws-lambda';

export const handler: SQSHandler = async (event) => {
  console.log('Rejection Messages Received: ', JSON.stringify(event));

  for (const record of event.Records) {
    try {
      const rejectionMessage = JSON.parse(record.body);
      console.log('Processing Rejection: ', rejectionMessage);

      // Add email logic here or log the rejection
      console.log(
        `Rejection reason: ${rejectionMessage.reason}, file: ${rejectionMessage.key}`
      );
    } catch (error) {
      console.error('Error processing rejection message:', error);
    }
  }
};
