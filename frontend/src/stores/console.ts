import { defineStore } from 'pinia'
import { ref } from 'vue'
import { endpoints } from '../services/api'
import { useWorkflowStore } from './workflow'

export interface Message {
    id: string
    type: 'user' | 'agent' | 'system'
    agent?: 'scholar' | 'engineer' | 'reviewer'
    content: string
    timestamp: Date
    isError?: boolean
}

export const useConsoleStore = defineStore('console', () => {
    const messages = ref<Message[]>([
        {
            id: '1',
            type: 'system',
            content: 'VeriFlow initialized. Agents ready.',
            timestamp: new Date()
        }
    ])

    const input = ref('')


    function addMessage(message: Partial<Message> & { content: string, type: Message['type'] }) {
        messages.value.push({
            id: message.id || Date.now().toString(),
            timestamp: message.timestamp || new Date(),
            ...message
        })
    }

    async function sendMessage(content: string, agent?: string) {
        if (!content.trim()) return

        const workflowStore = useWorkflowStore()
        const runId = workflowStore.currentRunId

        if (!runId) {
            addSystemMessage("Error: No active workflow run found. Please start a workflow first.")
            return
        }

        // 1. Add to local store (optimistic UI)
        addMessage({
            type: 'user',
            content,
            agent: agent as any, // Store target agent if any
            timestamp: new Date()
        })

        // 2. Send via HTTP
        try {
            // Add a temporary "thinking" message or just wait
            const response = await endpoints.chatWithAgent(runId, agent || 'scholar', content)

            // Add Agent Reply
            addMessage({
                type: 'agent',
                agent: (agent || 'scholar') as any,
                content: response.data.reply,
                timestamp: new Date()
            })

        } catch (error: any) {
            console.error("Chat error:", error)
            const errDetail = error.response?.data?.detail || error.message;
            let displayMsg = errDetail || 'Unknown error';
            try {
                const match = String(errDetail).match(/"message"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
                if (match && match[1]) {
                    displayMsg = match[1];
                }
            } catch (e) { }
            addSystemMessage(`Error sending message: ${displayMsg}`, true)
        }
    }

    async function sendApplyDirective(directive: string, agent: string) {
        const workflowStore = useWorkflowStore()
        const runId = workflowStore.currentRunId

        if (!runId) {
            addSystemMessage("Error: No active workflow run found.")
            return
        }

        try {
            addSystemMessage(`Applying directive to ${agent} and restarting...`)
            const response = await endpoints.applyAndRestart(runId, agent, directive)
            addSystemMessage(response.data.message)
        } catch (error: any) {
            console.error("Apply error:", error)
            addSystemMessage(`Error applying directive: ${error.message || 'Unknown error'}`)
        }
    }

    // Handle streaming chunks from agents
    // We keep track of the last streaming message to append chunks
    const lastStreamMessageId = ref<string | null>(null)

    function appendAgentMessage(agent: string, chunk: string) {
        // Enforce lowercase for styling matching
        const normalizedAgent = agent.toLowerCase()

        // If we have a current streaming message for this agent, append to it
        if (lastStreamMessageId.value) {
            const msgIndex = messages.value.findIndex(m => m.id === lastStreamMessageId.value)
            if (msgIndex !== -1 && messages.value[msgIndex].agent === normalizedAgent) {
                messages.value[msgIndex].content += chunk
                return
            }
        }

        // define new message
        const newId = Date.now().toString()
        addMessage({
            id: newId,
            type: 'agent',
            agent: normalizedAgent as any, // Cast to agent type
            content: chunk,
            timestamp: new Date()
        })
        lastStreamMessageId.value = newId
    }

    function addSystemMessage(content: string, isError: boolean = false) {
        // Reset stream tracking on system message (status update)
        lastStreamMessageId.value = null

        addMessage({
            type: 'system',
            content,
            timestamp: new Date(),
            isError
        })
    }

    return {
        messages,
        input,
        addMessage,
        sendMessage,
        appendAgentMessage,
        addSystemMessage,
        sendApplyDirective
    }


})
