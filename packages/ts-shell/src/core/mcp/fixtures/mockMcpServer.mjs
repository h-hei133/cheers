process.stdin.setEncoding('utf8')

let input = ''
process.stdin.on('data', chunk => {
  input += chunk
})

process.stdin.on('end', () => {
  const request = JSON.parse(input || '{}')

  if (request.action === 'list-tools') {
    process.stdout.write(
      JSON.stringify({
        tools: [
          {
            name: 'echo_message',
            description: 'Echo a message from stdio MCP',
            inputSchema: { type: 'object', required: ['message'] },
          },
        ],
      }),
    )
    return
  }

  if (request.action === 'invoke-tool') {
    const message = request.args?.message ?? 'missing'
    if (message === 'mcp-error') {
      process.stdout.write(JSON.stringify({
        content: 'MCP tool rejected request: invalid message',
        isError: true,
      }))
      return
    }
    if (message === 'mcp-throw') {
      process.stderr.write('MCP stdio execution failed')
      process.exitCode = 1
      return
    }
    process.stdout.write(JSON.stringify({ content: `echo:${message}` }))
    return
  }

  process.stderr.write('Unknown action')
  process.exitCode = 1
})
