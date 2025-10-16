import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Get credentials from environment variables
    const validUsername = process.env.AUTH_USERNAME
    const validPassword = process.env.AUTH_PASSWORD

    // Verify environment variables are set
    if (!validUsername || !validPassword) {
      console.error('AUTH_USERNAME or AUTH_PASSWORD not set in environment variables')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Verify credentials
    if (username === validUsername && password === validPassword) {
      // Create session with a fixed user ID for internal use
      await createSession('internal-user')

      return NextResponse.json(
        { success: true, message: 'Login successful' },
        { status: 200 }
      )
    } else {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    )
  }
}
