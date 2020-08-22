const AWS = require('aws-sdk');

const dynamo = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context) => {
    console.log('User ID is: ', event.requestContext.identity.accountid);
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    let body;
    let statusCode = '200';
    
    const headers = {
        'Content-Type': 'application/json',
    };

    try {
        switch (event.httpMethod) {
            case 'GET':
                body = await dynamo.scan({ TableName: event.queryStringParameters.TableName }).promise();
                break;
            case 'POST':
                let requestObject = JSON.parse(event["body"]);
                console.log("sub value: ", event.requestContext.authorizer.claims.sub);
                requestObject.Item.userid = event.requestContext.authorizer.claims.sub;
                
                //if (event.requestContext.identity.accountid == null) {
                //    requestObject.Item.userid = "no-auth;";    
                    //throw new Error(`No UserID Authentication "${requestObject.Item.userid}"`);
                //}
                body = await dynamo.put(requestObject).promise();
                break;
            default:
                throw new Error(`Unsupported method "${event.httpMethod}"`);
        }
    } catch (err) {
        statusCode = '400';
        body = err.message;
    } finally {
        body = JSON.stringify(body);
    }

    return {
        statusCode,
        body,
        headers,
    };
};
