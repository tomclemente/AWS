var mysql = require('mysql');
const AWS = require('aws-sdk');

var connection = mysql.createConnection({
    host: process.env.RDS_ENDPOINT,
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DATABASE
});

exports.handler = async (event, context) => {

    let username = event.requestContext.authorizer.claims.username;
    let params = JSON.parse(event["body"]);
    
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    if (username == null) {
        throw new Error("Username missing. Not authenticated.");
    }
    
    
    let body;
    let statusCode = '200';

    const headers = {
        'Content-Type': 'application/json',
    };

    try {
        
        body = await new Promise((resolve, reject) => {

            let sql, queryresult;
            switch (event.httpMethod) {

                case 'GET': // Return user details from usermaster based on userid
                    sql = "SELECT * FROM UserMaster where userid = '" + username + "'";
                    executeQuery(sql).then(resolve,reject);
                break;

                case 'POST': // Read user details from the auth token
                            // Create an entry in usermaster
                    insertUserMaser(params,username).then(resolve,reject);
                break;
                    
                case 'PUT': // Update cognito record and usermaster table        
                    updateUserAttribute('email', params.email, username, process.env.COGNITO_POOLID).then(function() {
                        sql = "UPDATE UserMaster SET userid = '" + params.email + "' WHERE userid = '" + username + "'";
                        console.log("query: ", sql);
                        executeQuery(sql).then(resolve,reject);  
                    });
                break;
                
                case 'DELETE': 
                    sql = "DELETE FROM UserMaster where userid = '" + username + "'";
                    
                    executeQuery(sql).then(function(){ 
                        const cognito = new AWS.CognitoIdentityServiceProvider({ region: process.env.REGION });
                        cognito.adminDeleteUser({
                            UserPoolId: process.env.COGNITO_POOLID,
                            Username: 'sample', //replace to username, use sample for testing purposes to avoid recreating tokens.
                        }).promise().then(resolve,reject);
                    });  
                break;
                    
                default:
                    throw new Error(`Unsupported method "${event.httpMethod}"`);
            }    
        });

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

function executeQuery(sql) {
    return new Promise((resolve, reject) => {
        connection.query(sql, function(err, result) {
            if (err) {
                console.log("Error: " + err);
                reject(err);
            }
            resolve(result);
        });
    });
};

function updateUserAttribute(name, value, username, userPoolId){
    let cognitoISP = new AWS.CognitoIdentityServiceProvider({ region: process.env.REGION });
    return new Promise((resolve, reject) => {
        let params = {
            UserAttributes: [
                {
                    Name: name,
                    Value: value 
                }
            ],
            UserPoolId: userPoolId,
            Username: username
        };

        cognitoISP.adminUpdateUserAttributes(params, (err, data) => err ? 
        reject(err) : resolve(data));
    });
};

function insertUserMaser(params,username){
    return new Promise((resolve, reject) => {
       
        let sql = "INSERT INTO UserMaster (userid, name, userType, organization, title, lastLogin, createdOn) \
            VALUES (\
                '" + username + "',\
                '" + params.name + "',\
                '" + params.userType + "',\
                '" + params.organization + "',\
                '" + params.title + "',\
                '" + params.lastLogin + "',\
                '" + params.created + "')";

        executeQuery(sql).then(resolve,reject);
    });
};