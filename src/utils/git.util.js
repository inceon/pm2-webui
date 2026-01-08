import { execa } from 'execa';

export const getCurrentGitBranch = async (cwd) => {
    try {
        const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        return stdout.trim();
    } catch (err) {
        return null;
    }
};

export const getCurrentGitCommit = async (cwd) => {
    try {
        const { stdout } = await execa('git', ['rev-parse', '--short', 'HEAD'], { cwd });
        return stdout.trim();
    } catch (err) {
        return null;
    }
};

export const getRemoteGitCommit = async (cwd) => {
    try {
        const branch = await getCurrentGitBranch(cwd);
        if (!branch) return null;
        
        // Fetch latest changes from remote without merging
        await execa('git', ['fetch'], { cwd });
        
        // Get the remote commit hash
        const { stdout } = await execa('git', ['rev-parse', '--short', `origin/${branch}`], { cwd });
        return stdout.trim();
    } catch (err) {
        return null;
    }
};

export const checkForUpdates = async (cwd) => {
    try {
        const currentCommit = await getCurrentGitCommit(cwd);
        const remoteCommit = await getRemoteGitCommit(cwd);
        
        if (!currentCommit || !remoteCommit) {
            return { hasUpdates: false, message: 'Unable to check for updates' };
        }
        
        if (currentCommit === remoteCommit) {
            return { 
                hasUpdates: false, 
                message: 'Up to date',
                currentCommit,
                remoteCommit
            };
        }
        
        // Get number of commits behind
        const { stdout } = await execa('git', ['rev-list', '--count', `${currentCommit}..${remoteCommit}`], { cwd });
        const commitsBehind = parseInt(stdout.trim());
        
        return { 
            hasUpdates: true, 
            message: `${commitsBehind} commit${commitsBehind > 1 ? 's' : ''} behind`,
            currentCommit,
            remoteCommit,
            commitsBehind
        };
    } catch (err) {
        return { hasUpdates: false, message: 'Error checking for updates', error: err.message };
    }
};

export const pullUpdates = async (cwd) => {
    try {
        const branch = await getCurrentGitBranch(cwd);
        if (!branch) {
            return { success: false, message: 'Unable to determine current branch' };
        }
        
        // Pull latest changes
        const { stdout, stderr } = await execa('git', ['pull', 'origin', branch], { cwd });
        
        return { 
            success: true, 
            message: 'Successfully pulled updates',
            output: stdout || stderr
        };
    } catch (err) {
        return { 
            success: false, 
            message: 'Failed to pull updates', 
            error: err.message,
            output: err.stderr || err.stdout
        };
    }
};