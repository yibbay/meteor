(function () {
  var connect = __meteor_bootstrap__.require("connect");

  Meteor.accounts.oauth2._services = {};

  Meteor.accounts.oauth._setup({oauthVersion: 2});

  // connect middleware
  Meteor.accounts.oauth2._handleRequest = function (req, res, next) {

    // req.url will be "/_oauth/<service name>?<action>"
    // NOTE: query param is mandatory.
    var barePath = req.url.substring(0, req.url.indexOf('?'));
    var splitPath = barePath.split('/');

    // Find service based on url
    var serviceName = splitPath[2];
    var service = Meteor.accounts.oauth2._services[serviceName];

    // Any non-oauth request will continue down the default middlewares
    // Same goes for service that hasn't been registered
    if (splitPath[1] !== '_oauth' || !service) {
      next();
      return;
    }

    // Make sure we prepare the login results before returning.
    // This way the subsequent call to the `login` method will be
    // immediate.

    // Get or create user id
    var oauthResult = service.handleOauthRequest(req.query);

    if (oauthResult) { // could be null if user declined permissions
      var userId = Meteor.accounts.updateOrCreateUser(oauthResult.options, oauthResult.extra);

      // Generate and store a login token for reconnect
      // XXX this could go in accounts_server.js instead
      var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});

      // Store results to subsequent call to `login`
      Meteor.accounts.oauth2._loginResultForState[req.query.state] =
        {token: loginToken, id: userId};
    }

    // We support ?close and ?redirect=URL. Any other query should
    // just serve a blank page
    if ('close' in req.query) { // check with 'in' because we don't set a value
      // Close the popup window
      res.writeHead(200, {'Content-Type': 'text/html'});
      var content =
            '<html><head><script>window.close()</script></head></html>';
      res.end(content, 'utf-8');
    } else if (req.query.redirect) {
      res.writeHead(302, {'Location': req.query.redirect});
      res.end();
    } else {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end('', 'utf-8');
    }
  };

  // Listen on /_oauth/*
  __meteor_bootstrap__.app
    .use(connect.query())
    .use(function(req, res, next) {
      // Need to create a Fiber since we're using synchronous http
      // calls and nothing else is wrapping this in a fiber
      // automatically
      Fiber(function () {
        Meteor.accounts.oauth2._handleRequest(req, res, next);
      }).run();
    });

})();
