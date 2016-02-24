'use strict';

var esprima = require('esprima'),
    estraverse = require('estraverse'),
    escodegen = require('escodegen'),
    _ = require('lodash'),
    fs = require('fs'),
    path = require('path'),
    assert = require('assert'),
    util = require('util');

module.exports = {

    handlers: function (file, framework, route) {
        var content, ast, existingMethods = {};

        content = fs.readFileSync(file);
        ast = esprima.parse(content, { tokens: true, range: true, comment: true, sourceType: 'module' });

        estraverse.traverse(ast, {
          enter: function (node) {
            if (node.type === 'ExpressionStatement' && _.isObject(node.expression) && node.expression.type === 'AssignmentExpression' && _.isObject(node.expression.left)
            && node.expression.left.object.name === 'module' && node.expression.left.property.name === 'exports') {
              node.expression.right.properties.forEach(function(property) {
                var methodName = property.key.name;
                existingMethods[methodName] = true;
              });
            }
          }
        });

        route.methods.forEach(function (method) {
            var handler, strfn, newast;

            if (existingMethods[method.method]) {
                return;
            }

            strfn =   '    /**\n' +
                      '     * %s\n' +
                      '     * parameters: %s\n' +
                      '     * produces: %s\n' +
                      '     */\n';

            strfn = util.format(strfn, method.description, method.parameters.map(function (p) { return p.name; }).join(', '), method.produces && method.produces.join(', '));

            if (framework === 'hapi') {
                strfn += 'function ' + method.name + '(req, reply) {\n    reply().code(501);\n}';

            }
            else if (framework === 'restify') {
                strfn += 'function ' + method.name + '(req, res) {\n    res.send(501);\n}';
            }
            else if (framework === 'express') {
                strfn += 'function ' + method.name + '(req, res) {\n    res.sendStatus(501);\n}';
            }

            newast = esprima.parse(strfn, { tokens: true, range: true, comment: true, sourceType: 'module' });

            handler = esprima.parse(strfn).body[0];
            handler.type = 'FunctionExpression';

            ast.body.forEach(function (element) {
                var assigned;

                if (_.isObject(element.expression) && element.expression.type === 'AssignmentExpression' && element.expression.left.object.name === 'module') {
                    assigned = element.expression.right;

                    assert.strictEqual(assigned.type, 'ObjectExpression');

                    newast.comments[0].range[1] = newast.comments[0].range[1] - newast.comments[0].range[0];
                    newast.comments[0].range[0] = assigned.properties[assigned.properties.length - 1].range[1] + 1;
                    newast.comments[0].range[1] = newast.comments[0].range[0] + newast.comments[0].range[1];

                    handler.range = [];
                    handler.range[0] = newast.comments[0].range[1] + 1;
                    handler.range[1] = handler.range[0] + (newast.body[0].range[1] - newast.body[0].range[0]);

                    assigned.properties.push({
                        type: 'Property',
                        key: {
                            type: 'Identifier',
                            name: method.method,
                            range: [handler.range[0], handler.range[0] + method.method.length]
                        },
                        value: handler,
                        range: handler.range,
                        kind: 'init',
                        leadingComments: newast.comments
                    });
                }
            });

        });

        ast = escodegen.attachComments(ast, ast.comments, ast.tokens);

        return escodegen.generate(ast, { comment: true });
    },

    tests: function (file, options) {
        var content, ast, existingTests = {}, newTests = [];

        content = fs.readFileSync(file);
        ast = esprima.parse(content, { tokens: true, range: true, comment: true, sourceType: 'module' });

        estraverse.traverse(ast, {
          enter: function (node) {
            if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.name === 'it') {
              var testName = node.expression.arguments[0].value;
              existingTests[testName] = true;
            }
          }
        });

        options.operations.forEach(function (operation) {
          if(existingTests['should ' + operation.method + ' ' + operation.path]) {
            return;
          }

          var templateContents = fs.readFileSync(path.join(__dirname, 'templates/_test_mocha_express_operation.js'));
          var testOptions = _.assign({}, options, {operation: operation});
          testOptions.operation = operation;
          var compiled = _.template(templateContents);
          var operationTestAst = esprima.parse(compiled(testOptions), { tokens: true, range: true, comment: true, sourceType: 'module' });
          newTests.push(operationTestAst.body[0]);
        });

        if(newTests.length > 0) {
          ast = estraverse.replace(ast, {
            enter: function (node) {
              if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.name === 'describe') {
                node.expression.arguments[1].body.body = node.expression.arguments[1].body.body.concat(newTests);
                return node;
              }
            }
          });
        }

        return escodegen.generate(ast, { comment: true });
    }

};
