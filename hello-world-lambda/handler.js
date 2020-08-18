'use strict';

module.exports.hello = async event => {
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Hello Serverless Offline from hands-on.cloud!',
        input: event,
      },
      null,
      2
    ),
  };
};
