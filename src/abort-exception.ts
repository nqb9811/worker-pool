/** Unified exception to recognize error from aborting. */
export class AbortException extends Error {
    public code = 499;
    public type = 'abort';

    constructor() {
        super('Operation aborted');
    }

    /** Check if an error is abort exception. */
    static isAbortException(error: any) {
        return (
            error instanceof AbortException
            || (error?.code === 499 && error?.type === 'abort')
        );
    }
}
