var mysql = require('mysql');
var AWS = require('aws-sdk');
var sourceEmail = "noreply@ratingsuite.com";

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
                    insertUserMaser(params,username).then(function() {

                        sql = "SELECT * FROM UserPool where userid = '" + username + "'";
                        executeQuery(sql).then(function(data) {
                            insertNotification(username, data.upid, params);

                            var emailParam = generateWelcomeParam(username);
                            sendEmail(emailParam).then(resolve,reject);
                        })    
                    },reject);
                break;
                    
                case 'PUT': // Update cognito record and usermaster table        
                    updateUserAttribute(params.attributes, username, process.env.COGNITO_POOLID).then(function() {
                        sql = "UPDATE UserMaster SET userid = '" + params.email + "' WHERE userid = '" + username + "'";
                        console.log("query: ", sql);
                        executeQuery(sql).then(resolve,reject);  
                    });
                break;
                
                case 'DELETE': 
                    var userPoolData;
                    var subscriptionData;
                    var userMasterData;
                    sql = "SELECT * FROM UserMaster where userid = '" + username + "'";
                    
                    executeQuery(sql).then(function(data) { 
                        userMasterData = data[0];
                        console.log("userMasterData : ", userMasterData);
                        sql = "SELECT * FROM UserPool where userid = '" + username + "'";

                        executeQuery(sql).then(function(data) { 
                            userPoolData = data[0];
                            console.log("userPoolData : ", userPoolData);

                            sql = "SELECT * FROM Subscription where idUserPool = '" + data[0].idUserPool + "'";

                            executeQuery(sql).then(function(data) { 
                            subscriptionData = data[0];
                            console.log("subscriptionData : ", subscriptionData);

                            if (subscriptionData == undefined || subscriptionData == null) {


                            }

                            if ((userPoolData.type == 'user' && subscriptionData.subscriptionType =='pp1') ||
                                (userPoolData.type == 'admin' && userMasterData.usertype != 'E')) {

                                sql = "UPDATE Subscription SET subscriptionStatus = 'cancelled' where idUserPool = '" + userPoolData.idUserPool + "'";
                                    executeQuery(sql).then(function(data) { 
                                        //resolve(data);
                                });
                            }
                                //Delete all related data when there's nothing tied to any subscription
                                sql = "SELECT * FROM Subscription where upid = '" + username + "' and subscriptionStatus = 'active'";
                                executeQuery(sql).then(function(data) {   
                                    if (data == undefined || data == null) {
                                        sql = "DELETE FROM UserProduct  where upid = '" + username + "'";
                                        executeQuery(sql).then(resolve,reject);

                                        sql = "DELETE FROM ProductMaster  where upid = '" + username + "'";
                                        executeQuery(sql).then(resolve,reject);
                                    }   
                                });

                                //Send Email when Notificaiton is enabled
                                sql = "SELECT * FROM Notification where userid = '" + username + "'";
                                executeQuery(sql).then(function(data) {   
                                    console.log("Notification data : ", data[0]);
                                    if (data == undefined || data == null) {
                                        resolve(data);
                                    }
                                    else if (data.flag == '1') {
                                        const cognito = new AWS.CognitoIdentityServiceProvider({ region: process.env.REGION });
                                        cognito.adminDeleteUser({
                                            UserPoolId: process.env.COGNITO_POOLID,
                                            Username: 'sample', //replace to username, use sample for testing purposes to avoid recreating tokens.
                                        }).promise().then(function(){
                                            var emailParam = generateGoodbyeParam(username);
                                            sendEmail(emailParam).then(resolve,reject);
                                        });
                                    }
                                });

                                 //Delete from USerMaster
                                 sql = "DELETE FROM UserMaster where userid = '" + username + "'";
                                 executeQuery(sql).then(resolve, reject);
                            });
                        }); 
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
        console.log("Executing query: ", sql);
        connection.query(sql, function(err, result) {
            if (err) {
                console.log("SQL Error: " + err);
                reject(err);
            }
            //console.log("SQL Result: " + result.JSON);
            resolve(result);
        });
    });
};

function updateUserAttribute(userAttributes, username, userPoolId){
    let cognitoISP = new AWS.CognitoIdentityServiceProvider({ region: process.env.REGION });
    return new Promise((resolve, reject) => {
        console.log("userAttributes: ", userAttributes);
        let params = {
            // UserAttributes: [
            //     {
            //         Name: name,
            //         Value: value 
            //     }
            // ],
            UserAttributes: userAttributes,
            UserPoolId: userPoolId,
            Username: username
        };

        cognitoISP.adminUpdateUserAttributes(params, (err, data) => err ? 
        reject(err) : resolve(data));
    });
};

function insertUserMaser(params,username){
    return new Promise((resolve, reject) => {
       
        let sql = "INSERT INTO UserMaster (userid, name, userStatus, userType, organization, lastLogin, createdOn) \
            VALUES (\
                '" + username + "',\
                '" + params.name + "',\
                'NEW',\
                'NE',\
                '" + params.organization + "',\
                '" + params.lastLogin + "',\
                '" + params.created + "')";

        executeQuery(sql).then(resolve,reject);
    });
};

function insertNotification(username, upid, params){
    return new Promise((resolve, reject) => {
       
        let sql = "INSERT INTO Notification (userid, notificationTypeID, upid, flag, frequency, lastUpdatedDt) \
            VALUES (\
                '" + username + "',\
                '1',\
                '" + upid + "',\
                '1',\
                '" + params.frequency + "',\
                '" + params.lastUpdatedDt + "')";

        executeQuery(sql).then(resolve,reject);
    });
};

function sendEmail(params) {
    return new Promise((resolve, reject) => {
        var ses = new AWS.SES({region: 'us-east-1'});
        ses.sendEmail(params, function (err, data) {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                console.log(data);
                resolve(data);
            }
        });
    });
};

function generateWelcomeParam(email) {

    var param = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                Text: { Data: "Welcome to RatingSuite!"

                }
            },
            Subject: { Data: "Welcome Email" }
        },
        Source: sourceEmail
    };

    return param;
}

function generateGoodbyeParam(email) {
    var param = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                Text: { Data: "Sad to see you go!"

                }
            },
            Subject: { Data: "Bye Email" }
        },
        Source: sourceEmail
    };

    return param;
}