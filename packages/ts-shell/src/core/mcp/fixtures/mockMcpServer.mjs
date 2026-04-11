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
    process.stdout.write(JSON.stringify({ content: `echo:${message}` }))
    return
  }

  process.stderr.write('Unknown action')
  process.exitCode = 1
})
