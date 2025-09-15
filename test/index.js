const assert = require('assert');
const tune = require('tune-sdk');
const cp = require("child_process");
const mcp = require('../src/index');
const { files } = require("tune-fs")


const tests = {};


async function delay(seconds) {
  return new Promise(resolve => {
    setTimeout(resolve,  seconds*1000)
  })
}

// let start_port = 3001
async function spawn({ cmd, args, PORT }) {

  // let PORT = start_port++
  const proc = cp.spawn(cmd, args, 
    { 
      stdio: 'pipe',
      env: { ...process.env, PORT }
    });
  
  let resolve
  let reject
  const p = new Promise((r1, r2) => { 
    resolve = r1
    reject  = r2
  })
  let output = ""
  proc.stderr.on("data", (chunk) => {
    output += chunk.toString() 
    process.stdout.write(chunk.toString())
    if (output.indexOf(`on port ${PORT}`) !== -1) {
      resolve(proc)
    }
  })
  proc.on("close", resolve)
  return p
}

async function basicTest(procArg) {
  // console.log("basic", procArg)
  const ctx = tune.makeContext(mcp(), files({ path: "test" }))
  const proc = await ctx.resolve("mcp", { type: "processor" })
  
  assert.ok(proc, "mcp processor not found")
  assert.equal(proc.type, "processor", "it should have type processor")

  const tools =  await proc.exec(null, procArg, ctx)
  // console.log(tools)
  const echo = tools.find(tool => tool.name == 'echo')

  assert.ok(echo, "echo tool not found")
  const result = await echo.exec({ message: "hello"}, ctx)
  assert.match(result, /hello/, "echo does not return 'hello'")
}

tests.basic = async function(){
  const sse = await spawn({ 
    cmd: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything', 'sse'], 
    PORT: 3010
  });
  const http = await spawn({ 
    cmd: 'npx', 
    args: ['-y', '@modelcontextprotocol/server-everything', 'streamableHttp'], 
    PORT: 3011
  });
  try {
    console.log("basic - stdio")
    await basicTest("npx -y @modelcontextprotocol/server-everything")
    await basicTest("stdio npx -y @modelcontextprotocol/server-everything")

    console.log("basic - sse")
    await basicTest("http://localhost:3010/sse")
    await basicTest("sse http://localhost:3010/sse")

    console.log("basic - streamableHttp")
    await basicTest("http://localhost:3011/mcp")
    await basicTest("streamable-http http://localhost:3011/mcp")

    console.log("basic - config")
    await basicTest("@config_single")
    await basicTest("config @config_single.json")
    await basicTest("@config_single_sse")
    await basicTest("@config_single_http")
  } catch (e) {
    throw(e)
  } finally {
    sse.kill() 
    http.kill()
  }
}

tests.img = async function() {
  const ctx = tune.makeContext(mcp(), files({ path: "test" }))
  const proc = await ctx.resolve("mcp", { type: "processor" })

//   const chat = `
// user:
// @{|mcp  }
// `

  const tools =  await proc.exec(null, "npx -y @modelcontextprotocol/server-everything", ctx)
  const getTinyImage = tools.find(tool => tool.name == 'getTinyImage')
  const result = await getTinyImage.exec({}, ctx)
  console.log(result)
}

async function configTest(config) {
    const ctx = tune.makeContext(
      mcp(config), 
      files({ path: "test" })
    )
    let result
    result = await ctx.resolve("everything-stdio/echo")

    assert.ok(result, "echo not found")
    assert.equal(result.name, "echo", "name should be echo")
    assert.equal(result.type, "tool", "type should be tool")

    result = await result.exec({message: "hello"}, ctx)
    assert.equal(result, "Echo: hello", "echo should return Echo: hello")

    result = await ctx.resolve("everything-stdio/printEnv")
    result = await result.exec({}, ctx)
    assert.ok(result.indexOf("HELLO") !== -1, "should have HELLO env variable")

    // assert.equal(result, "Echo: hello", "echo should return Echo: hello")

    result = await ctx.resolve("everything-stdio")
    assert.ok(Array.isArray(result), "everything-stdio should be array")

    result = await ctx.resolve("everything-http/echo")
    assert.ok(result, "echo not found")
    assert.equal(result.name, "echo", "name should be echo")
    assert.equal(result.type, "tool", "type should be tool")

    result = await ctx.resolve("everything-sse/echo")
    assert.ok(result, "echo not found")
    assert.equal(result.name, "echo", "name should be echo")
    assert.equal(result.type, "tool", "type should be tool")
}
tests.config = async function() {
  const sse = await spawn({ 
    cmd: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything', 'sse'],
    PORT: 3010
  })
  const http = await spawn({ 
    cmd: 'npx', 
    args: ['-y', '@modelcontextprotocol/server-everything', 'streamableHttp'],
    PORT: 3011
  });
  try {
    await configTest({ config: "./config_claude.json"})
    await configTest({ config: "./config_vscode.json"})
    await configTest({
      "everything-stdio": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-everything"],
        "env": { "HELLO": "WORLD" }
      },
      "everything-http": {
        "url":"http://localhost:3011/mcp" 
      },
      "everything-sse": {
        "url":"http://localhost:3010/sse" 
      }
    })
  } catch (e) {
    throw(e)
  } finally {
    sse.kill() 
    http.kill()
  }

}

tests.autocomplete = async function() {

  const sse = await spawn({ 
    cmd: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything', 'sse'],
    PORT: 3010
  })
  const http = await spawn({ 
    cmd: 'npx', 
    args: ['-y', '@modelcontextprotocol/server-everything', 'streamableHttp'],
    PORT: 3011
  });

  try {
    const ctx = tune.makeContext(mcp({
      "everything-stdio": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-everything"],
        "env": { "HELLO": "WORLD" }
      },
      "everything-http": {
        "url":"http://localhost:3011/mcp" 
      },
      "everything-sse": {
        "url":"http://localhost:3010/sse" 
      }
    }))
    let result = await ctx.resolve(".*", {match: "regex", output: "all"})
    // assert.ok(result.length === 3, "it should be 3 mcp mounts")
    //
    // result = await ctx.resolve("everything-sse/.*", {match: "regex", output: "all"})
    console.log(result)


  } catch (e) {
    throw(e)
  } finally {
    sse.kill() 
    http.kill()
  }
}


async function run(testList=[]){
  testList = testList.length ? testList : Object.keys(tests)
  let curTest
  while(curTest = testList.shift()) {
    try {
      await tests[curTest]()
      console.log(`pass: ${curTest}`)
    } catch (e) {
      console.log(`fail: ${curTest}`)
      console.error(e)
    }
  }
  

}
run(process.argv.slice(2));
