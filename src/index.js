const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");
const util = require('util');



// async function mcp(client, name, args, context) {
//   const toolList = await client.listTools()
// }
//
const clientList = {}

// TODO:
// 4 regex search
// wait til proc starts in tests
// cache client for the same string
// oauth
// image to file
// elicitation
// sample
// config.headers for http streamable (vscode/claude config)


async function getTools({ client, mount, expose }) {
  const res = await client.listTools()

  return res.tools
    .filter(item => !expose || expose.includes(item.name))
    .map(item => ({
      type: "tool",
      name: item.name,
      source: `${mount || "inline"}`,
      schema: { 
        name: item.name,
        description: item.description,
        parameters: item.inputSchema
      },
      exec: async (args, ctx) => { 
        let res = await client.callTool({ name: item.name, arguments: args }) 
        // console.log(util.inspect(res))
        res = res.toolResult || res
        const content = res.content
        .map(item => {
          if (item.type == "text") {
            return item.text.replaceAll("@", "\\@")
          } else if (item.type === "image") {
            // ctx.write()
          }
          return ""
        })
        .join("\n")

        if (res.isError) {
          throw Error(`error calling ${item.name}\n${content}`)
        }
        return content
      }
    }))
}

const createMCPmiddleware = async function(config = {}) {
  const { command, args, url, env, mount, headers, expose, imgPath }  = config;
  let { type } = config
  // config.command
  // config.args
  // config.type
  // config.url
  // config.env
  // config.mount
  // config.expose
  // config.imgPath - where to save images
  let cacheKey = JSON.stringify({command, args, type, url, env, headers }) 
  if (!command && !url) {
    throw Error("either url or command has to be set")
  }

  // console.log("config", config)

  async function getClient() {
    let client = clientList[cacheKey]
    if (!client)  {
      client = new Client( {
        name: "tune-client",
        version: "1.0.0"
      }
      );

      let transport
      let match
      if (url && !type) {
        if (url.match(/^https?:\/\/.*\/sse$/)) {
          type = "sse"
        } else {
          type = "streamable-http"
        }
        cacheKey = JSON.stringify({command, args, type, url, env, headers }) 
      }

      if (type === "sse") {
        transport = new SSEClientTransport(new URL(url), { requestInit: { headers }});
      } else if(type === "streamable-http") {
        transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers }});
      } else if(command) {
        transport = new StdioClientTransport({ command, args, env });
      } else {
        throw Error("neigher url not command is set for mcp")
      }
      await client.connect(transport)
      clientList[cacheKey] = client
    } 
    return client
  }
  
  return async function mcp(name, args, ctx) {
    if (mount && args?.match !== "regex" && name.indexOf(mount) !== 0) {
      return
    }

    const actualName = mount ? name.slice(mount.length + 1) : name;
    let result = []
    const tools =  await getTools({ client: await getClient(), mount, expose })
    if (mount && args?.match === "regex") {
      const re = new RegExp(name)
      if (mount.match(re)) {
        result.push({
          type: "tool",
          name: mount,
          source: mount,
          read: async() => "",
          exec: async() => ""
        })
      }
      return result.concat(tools.filter(tool=> `${mount}/${tool.name}`.match(re)).map(tool => ({
        ...tool,
        name: `${mount}/${tool.name}`
      })))
    }else if (mount && name === mount) {
        return tools
    } else if (mount && !name.startsWith(mount + '/')) {
        return; // This provider only handles names with its mount prefix
    } else if (args?.match === "regex") {
      const re = new RegExp(actualName)
      result = tools.filter(item => item.name.match(re))
    } else {
      result = tools.filter(item => item.name === actualName)
    }

    if (expose) {
      result = result.filter(item => expose.contains(item.name))
    }
    if (args?.type && args.type !== "any") {
      result = result.filter(item => item.type === args.type)
    }
    return result;
  }
}


async function parseConfig(filename, localConfig, ctx) {
  if (filename) {
    let content = await ctx.read(filename)
    if (!content) {
      throw new Error(`config ${filename} not found`)
    }
    localConfig = JSON.parse(content)
  }
  // console.log("parseConfig", filename, localConfig)
  //single
  const configs = []
  if (localConfig.command || localConfig.url) {
    configs.push(localConfig)
  } else { 
    const servers = localConfig.mcpServers || localConfig.mcp?.servers || localConfig
    if (!servers) return configs
    for (const mount in servers) {
      // TODO: verify the structure of the config
      if (!servers[mount].command && !servers[mount].url){
        throw Error(`there must be set command or url for ${mount}`)
      }

      configs.push({
        ...servers[mount],
        mount
      })
    }
  }
  return configs
}

module.exports = function createMCPmiddlewares({ config, ...rest } = {}) {
  let configs;
  let mds = []

  return async function mcp(name, args, context) {
    if (!configs && name != config && (config || Object.keys(rest).length) ) {
      configs = await parseConfig(config, rest, this)
      for (const config of configs) {
        const md = await createMCPmiddleware(config) 
        mds.push(md)
      }
    }
    if (name === "mcp" && args.type === 'processor') {
      return {
        type: "processor",
        name: "mcp",
        source: "tune-mcp",
        exec: async function mcpproc(node, params, ctx) {
          const args = params.trim().split(/\s+/)
          let localConfigs = []
          let match
          if (args[0].match(/^https?:\/\/.*$/)) {
            localConfigs.push({ url: args[0] })
          } else if (args[0] === "sse" || args[0] === "streamable-http") {
            localConfigs.push({ 
              url: args[1], 
              type: args[0],
            })
          } else if((match = args[0].startsWith("@")) || args[0] === "config") {
            const filename = (match ? args[0] : args[1]).substr(1);
            localConfigs = localConfigs.concat(await parseConfig(filename, null, ctx))
          } else {
            let command = args[0]
            let args1  = args.slice(1)
            if (args[0] === "stdio") {
              command = args[1]
              args1 = args.slice(2)
            } 
            localConfigs.push({ command, args: args1 })
          }
          // console.log(localConfigs)

          let tools = []
          for (const config of localConfigs) {
            const md = await createMCPmiddleware(config) 
            tools = tools.concat(await md((config.mount || '') + ".*", { match: "regex", output: "all", }, ctx))
          }
          return tools
        }
      }
    }
    if (!configs) {
      return
    }
    let result = (args?.output === "all") ? [] : undefined
    for (const md of mds) {
      let res = await md(name, args, context)
      if (res) {
        if (args?.output === "all") {
          result = result.concat(res)
        } else {
          result = res
          break
        }
      }
    }

    return result
  }
}
