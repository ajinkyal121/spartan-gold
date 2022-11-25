"use strict";

const LIST = 1;
const OP = 2;
const NUM = 3;
const VAR = 4;

module.exports = class SmartInterpreter {
  constructor(contractAcc, blockChainBalances) {
    this.$me = contractAcc;
    this.blockChainBalances = blockChainBalances;
    this.globalEnv = null;
  }

  tokenize(contents) {
    let lines = contents.trim().split("\n");
    let tokens = [];
    lines.forEach((ln) => {
      ln = ln.replaceAll("(", " ( ").replaceAll(")", " ) ");

      ln = ln.replace(/;.*/, "");

      tokens.push(...ln.split(/\s+/).filter((s) => s.length !== 0));
    });
    return tokens;
  }

  // TODO - Replace this with standard parser
  parse(tokens) {
    let ast = { children: [] };
    for (let i = 0; i < tokens.length; i++) {
      let tok = tokens[i];
      if (tok === "(") {
        let newAst = { parent: ast, type: LIST, children: [] };
        ast.children.push(newAst);
        ast = newAst;
      } else if (tok === ")") {
        ast = ast.parent;
      } else if (tok.match(/^\d+$/)) {
        ast.children.push({ type: NUM, value: parseInt(tok) });
      } else if (tok.match(/^\w+$/)) {
        ast.children.push({ type: VAR, value: tok });
      } else {
        ast.children.push({ type: OP, value: tok });
      }
    }
    return ast.children;
  }

  printAST(ast) {
    console.log(
      `AST is ${JSON.stringify(ast, (key, value) => {
        if (key === "parent") return value.id;
        else return value;
      })}`
    );
  }

  evaluate(ast, env) {
    if (ast.type == NUM) {
      return ast.value;
    } else if (ast.type == VAR) {
      return env.findVar(ast.value);
    } else if (ast.value == "$me") {
      return this.$me;
    }

    let first = ast.children[0];
    let second = ast.children[1];
    let third = ast.children[2];
    let rest = ast.children.slice(2);

    switch (first.value) {
      case "$balance":
        if (second.value != "$me") {
          throw new Error(
            "Balance only accept one parameter having current context."
          );
        }
        let $me = this.evaluate(second, env);
        return this.blockChainBalances[$me];
      case "$transfer":
        let destination = this.evaluate(third, env);
        let amount = this.evaluate(second, env);
        if (this.blockChainBalances[this.$me] < parseInt(amount)) {
          throw new Error("Not enough balance.");
        }
        this.blockChainBalances.set(
          destination,
          this.blockChainBalances.get(destination) + amount
        );
        this.blockChainBalances.set(
          this.$me,
          this.blockChainBalances.get(this.$me) - amount
        );
        break;
      case "provide":
        env.provide.add(second.value);
        rest.forEach((val) => {
          env.provide.add(val.value);
        });
        break;
      case "define":
        env.varMap.set(second.value, this.evaluate(third, env));
        break;
      case "lambda":
        let params = [];
        // TODO - simplify
        second.children.forEach((val) => {
          if (val.type != VAR) {
            throw new Error("Lambda should only contain params");
          }
          params.push(val.value);
        });
        return new FunctionDef(params, third, new ScopingEnvironment(env));
      case "println":
        console.log(this.evaluate(second, env));
        break;
      case "+":
        return (
          rest.reduce((x, y) => x + this.evaluate(y, env), 0) +
          this.evaluate(second, env)
        );
      case "-":
        return this.evaluate(third, env) - this.evaluate(second, env);
      case "*":
        return (
          rest.reduce((x, y) => x + this.evaluate(y, env), 0) +
          this.evaluate(second, env)
        );
      case "/":
        return this.evaluate(third, env) / this.evaluate(second, env);
      default:
        if (typeof env.varMap.get(first.value) === "object") {

          // Check if method is allowed and in provide
          if (
            this.globalEnv.provide?.size > 0 &&
            !this.globalEnv.provide.has(first.value)
          ) {
            throw Error("Method not allowed, Try adding it in provide.");
          }

          let funcDef = env.varMap.get(first.value);

          if (funcDef.params.length >= 1) {
            funcDef.env.varMap.set(funcDef.params[0], second.value);

            // Handle multiple parameters
            if (rest.length != funcDef.params.length - 1) {
              throw Error("More than expected params in function.");
            }

            for (let i = 0; i < rest.length; i++) {
              funcDef.env.varMap.set(funcDef.params[i + 1], rest[i].value);
            }
          }

          return this.evaluate(funcDef.body, funcDef.env);
        }
    }
  }

  smartIntrepreter(script, env = new ScopingEnvironment(null)) {
    this.globalEnv = env;
    let tokens = this.tokenize(script);
    let asts = this.parse(tokens);
    // console.log(this.printAST(asts));

    asts.forEach((ast) => {
      this.printAST(ast);
      console.log("Final value -> ", this.evaluate(ast, env));
    });

    return "Done";
  }
};

class ScopingEnvironment {
  constructor(parent) {
    this.varMap = new Map();
    this.parent = parent;
    this.provide = new Set();
  }

  findVar(key) {
    // check in current scope else find in outer scope
    if (this.varMap.has(key)) {
      return this.varMap.get(key);
    } else {
      return this.parent.findVar(key);
    }
  }
}

class FunctionDef {
  constructor(params, body, env) {
    this.params = params;
    this.body = body;
    this.env = env;
  }
}
