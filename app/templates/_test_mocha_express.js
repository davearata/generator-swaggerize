import bodyParser from 'body-parser';
import enjoi from 'enjoi';
import express from 'express';
import path from 'path';
import request from 'supertest';
import swaggerize from 'swaggerize-express';
import chai from 'chai';
chai.should();
<%if (apiPath.indexOf('.yaml') === apiPath.length - 5 || apiPath.indexOf('.yml') === apiPath.length - 4) {%> import jsYaml from 'js-yaml'; <% } %>

describe('api', function () {
  let app;

  beforeEach(function() {
    app = express();
    app.use(require('body-parser')());
    app.use(swaggerize({
      api: path.join(__dirname, './<%=apiPath%>'),
      handlers: path.join(__dirname, '<%=handlers%>')
    }));
  });

<%_.forEach(operations, function (operation) {%>
  it('should <%=operation.method%> <%=operation.path%>', function (done) {
      <%
      var path = operation.path;
      var body;
      var responseCode = operation.responses && Object.keys(operation.responses)[0];
      var response = responseCode && operation.responses[responseCode];
      var responseSchema = response && response.schema;
      if (operation.parameters && operation.parameters.length) {
        _.forEach(operation.parameters, function (param) {
          if (param.in === 'path') {
            path = operation.path.replace(/{([^}]*)}*/, function (p1, p2) {
              switch (param.type) {
                case 'integer':
                case 'number':
                case 'byte':
                  return 1;
                case 'string':
                  return 'helloworld';
                case 'boolean':
                  return true;
                default:
                  return '{' + p2 + '}';
              }
            });
          }
          if (param.in === 'body' && param.schema && param.schema.$ref) {
            body = models[param.schema.$ref.slice(param.schema.$ref.lastIndexOf('/') + 1)];
          }
        });
      }
      if (body && (operation.method.toLowerCase() === 'post' || operation.method.toLowerCase() === 'put')) {%>
        var body = {<%_.forEach(Object.keys(body).filter(function (k) { return !!body[k]; }), function (k, i) {%>
          '<%=k%>': <%=JSON.stringify(body[k])%><%if (i < Object.keys(body).filter(function (k) { return !!body[k]; }).length - 1) {%>, <%}%><%})%>
      };
      <%} if (responseSchema) {%>
    var responseSchema = enjoi({<%_.forEach(Object.keys(responseSchema), function (k, i) {%>
      '<%=k%>': <%=JSON.stringify(responseSchema[k])%><%if (i < Object.keys(responseSchema).length - 1) {%>, <%}%><%})%>
    }, {
      '#':<%if (apiPath.indexOf('.yaml') === apiPath.length - 5 || apiPath.indexOf('.yml') === apiPath.length - 4) {%> jsYaml.load(fs.readFileSync(path.join(__dirname, './<%=apiPath%>'))) <% }else{ %> require(path.join(__dirname, './<%=apiPath%>')) <% } %>
    });
    <%}%>

    request(app).<%=operation.method.toLowerCase()%>('<%=resourcePath%><%=path%>')<%if (body && (operation.method.toLowerCase() === 'post' || operation.method.toLowerCase() === 'put')){%>.send(body)<%}%>
      .end(function (err, res) {
        if(err) {
          done(err);
        }
        res.statusCode.should.equal(<%=responseCode%>);
        <%if (responseSchema) {%>responseSchema.validate(res.body, done);<%}%>
     });
   });
<%});%>

});
